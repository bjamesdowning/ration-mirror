import {
	type StepContext,
	Think,
	type ToolCallContext,
	type ToolCallDecision,
	type ToolCallResultContext,
	type TurnContext,
} from "@cloudflare/think";
import {
	type Connection,
	type ConnectionContext,
	routeAgentRequest,
} from "agents";
import type { ToolSet } from "ai";
import { formatCopilotTemporalContextAppend } from "../app/lib/agent/temporal-context.server";
import { authenticateCopilot } from "../app/lib/copilot/auth.server";
import {
	COPILOT_SESSION_MAX_MESSAGES,
	COPILOT_SESSION_MAX_TOKENS,
	ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS,
} from "../app/lib/copilot/constants";
import {
	CopilotNeedsConsentError,
	ensureCopilotConversationOpen,
	getConversationCharge,
	persistConversationCharge,
	reconcileAndPersistCopilotConversationUsage,
} from "../app/lib/copilot/gate.server";
import { detectBlockedCopilotIntent } from "../app/lib/copilot/intent-guard.server";
import {
	COPILOT_MODEL_PRESETS,
	type CopilotModelPreset,
	ONBOARDING_BRIEFING_MODEL_PRESET,
	resolveCopilotModelPreset,
} from "../app/lib/copilot/model-profiles";
import {
	detectNativeFeatureSuggestion,
	type NativeFeatureEnabledMap,
} from "../app/lib/copilot/native-feature-hints.server";
import {
	finalizeOnboardingBriefing,
	getOnboardingBriefingSystemPromptAppend,
	getOnboardingBriefingTurnPolicy,
	isOnboardingAgentStepContinuing,
	isOnboardingBriefingExhausted,
	type OnboardingBriefingTurn,
	resolveAllowedOnboardingBriefingTurn,
} from "../app/lib/copilot/onboarding-briefing.server";
import {
	buildSessionUsageSnapshot,
	evaluateSessionLimitWarning,
	resolveCumulativeUsageTokens,
	type SessionLimitWarningSeverity,
} from "../app/lib/copilot/session-usage";
import { getCopilotSystemPrompt } from "../app/lib/copilot/system-prompt.server";
import {
	COPILOT_MCP_SCOPES,
	toAiSdkTools,
} from "../app/lib/copilot/tools.server";
import {
	buildFlagContext,
	isFeatureEnabled,
} from "../app/lib/feature-flags/flags.server";
import {
	checkBalance,
	InsufficientCreditsError,
} from "../app/lib/ledger.server";
import { log, redactId } from "../app/lib/logging.server";
import { checkRateLimit } from "../app/lib/rate-limiter.server";

const CORS_HEADERS = {
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers":
		"Content-Type, Authorization, X-Ration-Client",
};

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const LOCAL_WEB_ORIGINS = new Set([
	"http://localhost:5173",
	"http://127.0.0.1:5173",
]);

function trustedOrigins(env: Cloudflare.Env): Set<string> {
	const origins = new Set(["https://ration.mayutic.com", ...LOCAL_WEB_ORIGINS]);
	if (env.BETTER_AUTH_URL) {
		origins.add(env.BETTER_AUTH_URL.replace(/\/$/, ""));
	}
	return origins;
}

function requestOrigin(request: Request): string | null {
	return request.headers.get("Origin")?.replace(/\/$/, "") ?? null;
}

function isTrustedOrigin(request: Request, env: Cloudflare.Env): boolean {
	const origin = requestOrigin(request);
	return !origin || trustedOrigins(env).has(origin);
}

function corsHeaders(request: Request, env: Cloudflare.Env): HeadersInit {
	const origin = requestOrigin(request);
	return {
		...CORS_HEADERS,
		...(origin && trustedOrigins(env).has(origin)
			? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
			: {}),
	};
}

function jsonResponse(
	request: Request,
	env: Cloudflare.Env,
	body: unknown,
	init?: ResponseInit,
): Response {
	return Response.json(body, {
		...init,
		headers: { ...corsHeaders(request, env), ...init?.headers },
	});
}

function parseConversationId(url: URL): string {
	const queryId = url.searchParams.get("conversationId")?.trim();
	const conversationId =
		queryId || url.pathname.replace(/^\/copilot\/?/, "").trim() || "default";
	if (!CONVERSATION_ID_PATTERN.test(conversationId)) {
		throw new Error("invalid_conversation_id");
	}
	return conversationId;
}

function encodeAgentName(input: {
	organizationId: string;
	userId: string;
	tier: string;
	conversationId: string;
}): string {
	return encodeURIComponent(
		[
			input.organizationId,
			input.userId,
			input.tier || "member",
			input.conversationId,
		].join(":"),
	);
}

function writeCopilotMetric(
	env: Cloudflare.Env,
	event: string,
	identity: { organizationId: string; userId: string; source: string },
	conversationId: string,
	extra?: { blobs?: string[]; doubles?: number[] },
) {
	// Analytics Engine allows exactly ONE index per data point. Use the
	// organization (billing/grouping entity) as the sampling key and keep the
	// user id queryable via a blob. Telemetry is best-effort and must never
	// break the request path, so failures are swallowed.
	try {
		env.COPILOT_ANALYTICS?.writeDataPoint({
			blobs: [
				event,
				identity.source,
				conversationId,
				redactId(identity.userId),
				...(extra?.blobs ?? []),
			],
			doubles: extra?.doubles,
			indexes: [redactId(identity.organizationId)],
		});
	} catch (error) {
		log.error("[Copilot] metric write failed", error);
	}
}

function purgeSecret(env: Cloudflare.Env): string | undefined {
	return env.COPILOT_PURGE_SECRET ?? env.BETTER_AUTH_SECRET;
}

function decodeAgentName(name: string) {
	const [organizationId, userId, tier, conversationId] =
		decodeURIComponent(name).split(":");
	if (!organizationId || !userId || !conversationId) {
		throw new Error("Invalid copilot conversation identity");
	}
	return {
		organizationId,
		userId,
		tier: tier || "member",
		conversationId,
	};
}

function lastUserText(ctx: TurnContext): string {
	for (let index = ctx.messages.length - 1; index >= 0; index -= 1) {
		const message = ctx.messages[index];
		if (message?.role !== "user") continue;
		const content = message.content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return content
				.map((part) =>
					typeof part === "object" &&
					part !== null &&
					"text" in part &&
					typeof part.text === "string"
						? part.text
						: "",
				)
				.join("\n");
		}
	}
	return "";
}

function countUserMessages(ctx: TurnContext): number {
	return ctx.messages.filter((message) => message.role === "user").length;
}

type CopilotAgentUsageConfig = {
	totalUsageTokens: number;
	sessionWarningsEmitted: SessionLimitWarningSeverity[];
	/** Must match CopilotConversationCharge.openedAt for the active KV charge. */
	chargeOpenedAt?: number;
};

async function resolveNativeFeatureFlags(
	env: Cloudflare.Env,
	userId: string,
): Promise<NativeFeatureEnabledMap> {
	const flagContext = buildFlagContext(
		new Request("https://copilot.internal/"),
		env,
		{ user: { id: userId } },
	);
	const keys = [
		"ai-scan-receipt",
		"ai-import-url",
		"ai-generate-meal",
		"ai-plan-week",
	] as const;
	const entries = await Promise.all(
		keys.map(
			async (key) =>
				[key, await isFeatureEnabled(env, key, flagContext)] as const,
		),
	);
	return Object.fromEntries(entries);
}

export class ProjectThinkAgent extends Think<Cloudflare.Env> {
	workspaceBash = false;
	private totalUsageTokens = 0;
	private billingBlocked = false;
	private sessionMessageCount = 0;
	private sessionWarningsEmitted = new Set<SessionLimitWarningSeverity>();
	private conversationModelPreset: CopilotModelPreset = "fast";
	private boundChargeOpenedAt: number | null = null;
	/** Soft-deny onboarding turns must not burn the free grant. */
	private onboardingTurnDenied = false;
	/** Active allowlisted onboarding turn (for tool hard-allowlist). */
	private onboardingActiveTurn: OnboardingBriefingTurn | null = null;
	/** Count the free grant once per allowlisted user turn (not per agent step). */
	private onboardingShouldCountTurn = false;
	/** Native AI kill-switch map for hints / system prompt (refreshed each turn). */
	private nativeFeatureFlags: NativeFeatureEnabledMap = {
		"ai-scan-receipt": false,
		"ai-import-url": false,
		"ai-generate-meal": false,
		"ai-plan-week": false,
	};

	private persistUsageConfig(): void {
		this.configure<CopilotAgentUsageConfig>({
			totalUsageTokens: this.totalUsageTokens,
			sessionWarningsEmitted: [...this.sessionWarningsEmitted],
			...(this.boundChargeOpenedAt != null
				? { chargeOpenedAt: this.boundChargeOpenedAt }
				: {}),
		});
	}

	private resetUsageForCharge(chargeOpenedAt: number, totalTokens = 0): void {
		this.totalUsageTokens = Math.max(0, Math.ceil(totalTokens));
		this.sessionWarningsEmitted.clear();
		this.boundChargeOpenedAt = chargeOpenedAt;
		this.persistUsageConfig();
	}

	private applyUsageConfigCache(): void {
		const cfg = this.getConfig<CopilotAgentUsageConfig>();
		if (!cfg) return;
		if (typeof cfg.chargeOpenedAt === "number") {
			this.boundChargeOpenedAt = cfg.chargeOpenedAt;
		}
		this.totalUsageTokens = resolveCumulativeUsageTokens({
			memory: this.totalUsageTokens,
			config: cfg.totalUsageTokens,
		});
		for (const severity of cfg.sessionWarningsEmitted ?? []) {
			if (severity === "soft" || severity === "urgent") {
				this.sessionWarningsEmitted.add(severity);
			}
		}
	}

	private async hydrateCumulativeUsage(
		identity: ReturnType<typeof decodeAgentName>,
	): Promise<Awaited<ReturnType<typeof getConversationCharge>>> {
		this.applyUsageConfigCache();
		const charge = await getConversationCharge(
			this.env,
			identity.organizationId,
			identity.conversationId,
		);
		if (!charge) {
			this.totalUsageTokens = 0;
			this.sessionWarningsEmitted.clear();
			this.boundChargeOpenedAt = null;
			this.configure<CopilotAgentUsageConfig>({
				totalUsageTokens: 0,
				sessionWarningsEmitted: [],
			});
			return null;
		}
		const chargeOpenedAt = charge.openedAt ?? Date.now();
		if (this.boundChargeOpenedAt !== chargeOpenedAt) {
			// Missing binding, legacy config, or recreated KV charge after TTL.
			this.resetUsageForCharge(chargeOpenedAt, charge.totalTokens ?? 0);
			return charge;
		}
		this.totalUsageTokens = resolveCumulativeUsageTokens({
			memory: this.totalUsageTokens,
			kv: charge.totalTokens,
		});
		this.persistUsageConfig();
		return charge;
	}

	private maybeEmitSessionLimitWarning(
		totalTokens: number,
		messageCount: number,
	): void {
		const warning = evaluateSessionLimitWarning({
			totalTokens,
			messageCount,
			emittedSoft: this.sessionWarningsEmitted.has("soft"),
			emittedUrgent: this.sessionWarningsEmitted.has("urgent"),
		});
		if (!warning) return;
		this.sessionWarningsEmitted.add(warning.severity);
		this.persistUsageConfig();
		this.broadcast(
			JSON.stringify({
				type: "session_limit_warning",
				warning,
			}),
		);
	}

	private async broadcastSessionUsageUpdate(
		identity: ReturnType<typeof decodeAgentName>,
		messageCount: number,
		creditsCharged: number,
	): Promise<void> {
		const creditBalance = await checkBalance(this.env, identity.organizationId);
		this.broadcast(
			JSON.stringify({
				type: "session_usage_update",
				usage: buildSessionUsageSnapshot({
					totalTokens: this.totalUsageTokens,
					messageCount,
					creditsCharged,
					creditBalance,
				}),
			}),
		);
	}

	override async onConnect(
		connection: Connection,
		ctx: ConnectionContext,
	): Promise<void> {
		await super.onConnect(connection, ctx);
		try {
			const identity = decodeAgentName(this.name);
			const charge = await this.hydrateCumulativeUsage(identity);
			if (this.totalUsageTokens <= 0) {
				return;
			}
			await this.broadcastSessionUsageUpdate(
				identity,
				this.sessionMessageCount,
				charge?.bracketCreditsCharged ?? 0,
			);
		} catch (error) {
			log.error("[Copilot] connect usage sync failed", error);
		}
	}

	getModel() {
		return "@cf/openai/gpt-oss-120b";
	}

	getSystemPrompt() {
		return getCopilotSystemPrompt(this.nativeFeatureFlags);
	}

	getTools(): ToolSet {
		const identity = decodeAgentName(this.name);
		return toAiSdkTools(this.env, {
			organizationId: identity.organizationId,
			userId: identity.userId,
			scopes: [...COPILOT_MCP_SCOPES],
			preClaim: false,
		}) as ToolSet;
	}

	async beforeTurn(ctx: TurnContext) {
		const identity = decodeAgentName(this.name);
		this.nativeFeatureFlags = await resolveNativeFeatureFlags(
			this.env,
			identity.userId,
		);
		this.sessionMessageCount = ctx.messages.length;
		const charge = await this.hydrateCumulativeUsage(identity);
		if (charge?.mode === "onboarding_briefing") {
			this.onboardingTurnDenied = false;
			this.onboardingActiveTurn = null;
			this.onboardingShouldCountTurn = false;

			const rl = await checkRateLimit(
				this.env.RATION_KV,
				"copilot",
				identity.userId,
			);
			if (!rl.allowed) {
				this.onboardingTurnDenied = true;
				this.broadcast(
					JSON.stringify({
						type: "error",
						error: {
							code: "rate_limited",
							message: "Copilot is cooling down. Please try again shortly.",
						},
					}),
				);
				return {
					system: `${ctx.system}\n\nThe current request is rate limited. Respond briefly that Copilot is cooling down and the user should try again shortly.`,
					activeTools: [],
					maxSteps: 1,
					maxOutputTokens: 64,
				};
			}

			const turnsUsed = charge.onboardingTurnsUsed ?? 0;
			if (
				charge.onboardingConsumed ||
				isOnboardingBriefingExhausted(turnsUsed) ||
				countUserMessages(ctx) > turnsUsed + 1
			) {
				this.onboardingTurnDenied = true;
				writeCopilotMetric(
					this.env,
					"onboarding_briefing_blocked_attempt",
					{ ...identity, source: "agent" },
					identity.conversationId,
				);
				this.broadcast(
					JSON.stringify({
						type: "error",
						error: {
							code: "onboarding_briefing_exhausted",
							message:
								"Your welcome briefing is complete. Unlock Ask Ration with credits or Crew Member.",
						},
					}),
				);
				return {
					system: `${ctx.system}\n\nThe welcome briefing is complete. Do not answer further questions.`,
					activeTools: [],
					maxSteps: 1,
					maxOutputTokens: 64,
				};
			}
			const userText = lastUserText(ctx);
			const briefingTurn = await resolveAllowedOnboardingBriefingTurn({
				userText,
				turnsUsed,
			});
			if (!briefingTurn) {
				this.onboardingTurnDenied = true;
				writeCopilotMetric(
					this.env,
					"onboarding_briefing_invalid_prompt",
					{ ...identity, source: "agent" },
					identity.conversationId,
				);
				this.broadcast(
					JSON.stringify({
						type: "error",
						error: {
							code: "onboarding_briefing_invalid_prompt",
							message:
								"That prompt isn't part of the welcome briefing. Tap Stock my kitchen or Get Started.",
						},
					}),
				);
				return {
					system: `${ctx.system}\n\nThe welcome briefing only accepts the canonical onboarding prompts. Reply with a single short sentence directing the user to use the onboarding buttons.`,
					activeTools: [],
					maxSteps: 1,
					maxOutputTokens: 64,
				};
			}

			this.onboardingActiveTurn = briefingTurn;
			this.onboardingShouldCountTurn = true;
			const policy = getOnboardingBriefingTurnPolicy(briefingTurn);
			const preset = ONBOARDING_BRIEFING_MODEL_PRESET;
			this.conversationModelPreset = preset;
			if (charge.modelPreset !== preset) {
				await persistConversationCharge(
					this.env,
					identity.organizationId,
					identity.conversationId,
					{ ...charge, modelPreset: preset },
				);
			}
			const profile = COPILOT_MODEL_PRESETS[preset];
			const workersAiOptions: Record<string, unknown> = {};
			if (profile.reasoningEffort !== null) {
				workersAiOptions.reasoning_effort = profile.reasoningEffort;
			}
			const maxOutputTokens =
				briefingTurn === "bootstrap"
					? ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS
					: profile.maxOutputTokens;

			return {
				system: `${ctx.system}${formatCopilotTemporalContextAppend()}${getOnboardingBriefingSystemPromptAppend(briefingTurn)}`,
				activeTools: policy.activeTools,
				maxSteps: policy.maxSteps,
				maxOutputTokens,
				temperature: profile.temperature,
				topP: profile.topP,
				sendReasoning: false,
				providerOptions: {
					"workers-ai": workersAiOptions,
				},
			};
		}
		if (this.billingBlocked) {
			return {
				system: `${ctx.system}\n\nThis conversation exhausted its credit allowance. Do not call tools. Tell the user to add credits and start a new chat, or start a new chat after the allowance resets.`,
				activeTools: [],
				maxSteps: 1,
			};
		}
		const rl = await checkRateLimit(
			this.env.RATION_KV,
			"copilot",
			identity.userId,
		);
		if (!rl.allowed) {
			this.broadcast(
				JSON.stringify({
					type: "error",
					error: {
						code: "rate_limited",
						message: "Copilot is cooling down. Please try again shortly.",
					},
				}),
			);
			return {
				system: `${ctx.system}\n\nThe current request is rate limited. Respond briefly that Copilot is cooling down and the user should try again shortly.`,
				activeTools: [],
				maxSteps: 1,
			};
		}
		if (ctx.messages.length > COPILOT_SESSION_MAX_MESSAGES) {
			this.broadcast(
				JSON.stringify({
					type: "error",
					error: {
						code: "session_limit_reached",
						message: "This Copilot chat is full. Start a new chat to continue.",
					},
				}),
			);
			return {
				system: `${ctx.system}\n\nThe current chat exceeded the maximum message count. Ask the user to start a new Copilot chat.`,
				activeTools: [],
				maxSteps: 1,
			};
		}
		if (this.totalUsageTokens >= COPILOT_SESSION_MAX_TOKENS) {
			this.broadcast(
				JSON.stringify({
					type: "error",
					error: {
						code: "session_limit_reached",
						message:
							"This Copilot chat reached its token limit. Start a new chat to continue.",
					},
				}),
			);
			return {
				system: `${ctx.system}\n\nThe current chat exceeded the maximum token budget. Ask the user to start a new Copilot chat.`,
				activeTools: [],
				maxSteps: 1,
			};
		}
		this.maybeEmitSessionLimitWarning(
			this.totalUsageTokens,
			ctx.messages.length,
		);
		const userText = lastUserText(ctx);
		const blocked = detectBlockedCopilotIntent(
			userText,
			this.nativeFeatureFlags,
		);
		if (blocked) {
			writeCopilotMetric(
				this.env,
				"blocked_feature",
				{ ...identity, source: "agent" },
				identity.conversationId,
				{ blobs: [blocked.feature] },
			);
			const clientBlocked = {
				feature: blocked.feature,
				message: blocked.message,
				deepLink: blocked.deepLink,
			};
			this.broadcast(
				JSON.stringify({
					type: "blocked_feature",
					blocked: clientBlocked,
				}),
			);
			const deepLinkGuidance = blocked.deepLink
				? ` Deep link: ${blocked.deepLink}`
				: "";
			return {
				system: `${ctx.system}\n\nThe current user request is blocked from the copilot tool loop. Respond with this exact guidance in natural language: ${blocked.message}${deepLinkGuidance}`,
				activeTools: [],
				maxSteps: 1,
			};
		}
		const nativeSuggestion = detectNativeFeatureSuggestion(
			userText,
			this.nativeFeatureFlags,
		);
		if (nativeSuggestion) {
			return {
				system: `${ctx.system}\n\nBefore taking action, briefly explain that ${nativeSuggestion.name} may be a better fit because ${nativeSuggestion.message.toLowerCase()} Offer this deep link: ${nativeSuggestion.deepLink}. Ask whether the user wants to use the native flow or continue in chat. Do not call tools this turn.`,
				activeTools: [],
				maxSteps: 1,
			};
		}

		const preset = resolveCopilotModelPreset(
			ctx.body?.modelPreset,
			this.conversationModelPreset ?? charge?.modelPreset,
		);
		this.conversationModelPreset = preset;
		if (charge && charge.modelPreset !== preset) {
			await persistConversationCharge(
				this.env,
				identity.organizationId,
				identity.conversationId,
				{ ...charge, modelPreset: preset },
			);
		}

		const profile = COPILOT_MODEL_PRESETS[preset];
		const workersAiOptions: Record<string, unknown> = {};
		if (profile.reasoningEffort !== null) {
			workersAiOptions.reasoning_effort = profile.reasoningEffort;
		}

		return {
			system: `${ctx.system}${formatCopilotTemporalContextAppend()}`,
			activeTools: Object.keys(ctx.tools),
			maxSteps: profile.maxSteps,
			maxOutputTokens: profile.maxOutputTokens,
			temperature: profile.temperature,
			topP: profile.topP,
			sendReasoning: true,
			providerOptions: {
				"workers-ai": workersAiOptions,
			},
			stopWhen: () => this.billingBlocked,
		};
	}

	beforeToolCall(ctx: ToolCallContext): ToolCallDecision | undefined {
		if (this.billingBlocked) {
			return {
				action: "block",
				reason:
					"Copilot cannot run more tools because this conversation exhausted its credit allowance.",
			};
		}
		if (this.onboardingActiveTurn === "bootstrap") {
			if (ctx.toolName !== "search_docs") {
				return {
					action: "block",
					reason: "Only search_docs is available during the welcome intro.",
				};
			}
		}
		if (
			this.onboardingActiveTurn === "seed" &&
			ctx.toolName !== "add_cargo_item"
		) {
			return {
				action: "block",
				reason:
					"Only add_cargo_item is available during the starter kitchen seed.",
			};
		}
		const identity = decodeAgentName(this.name);
		writeCopilotMetric(
			this.env,
			"tool_start",
			{ ...identity, source: "agent" },
			identity.conversationId,
			{ blobs: [ctx.toolName] },
		);
	}

	afterToolCall(ctx: ToolCallResultContext) {
		const identity = decodeAgentName(this.name);
		writeCopilotMetric(
			this.env,
			"tool_end",
			{ ...identity, source: "agent" },
			identity.conversationId,
			{
				blobs: [ctx.toolName, ctx.success ? "ok" : "error"],
				doubles: [ctx.durationMs],
			},
		);
	}

	async onStepFinish(ctx: StepContext) {
		const identity = decodeAgentName(this.name);
		const usageTokens =
			ctx.usage.totalTokens ??
			(ctx.usage.inputTokens ?? 0) + (ctx.usage.outputTokens ?? 0);
		this.totalUsageTokens = resolveCumulativeUsageTokens({
			memory: this.totalUsageTokens + usageTokens,
		});
		this.persistUsageConfig();
		let charge: Awaited<
			ReturnType<typeof reconcileAndPersistCopilotConversationUsage>
		>;
		try {
			charge = await reconcileAndPersistCopilotConversationUsage(
				this.env,
				identity,
				identity.conversationId,
				this.totalUsageTokens,
			);
			this.totalUsageTokens = resolveCumulativeUsageTokens({
				memory: this.totalUsageTokens,
				kv: charge.totalTokens,
			});
			this.persistUsageConfig();
		} catch (error) {
			if (error instanceof InsufficientCreditsError) {
				this.billingBlocked = true;
				this.broadcast(
					JSON.stringify({
						type: "error",
						error: {
							code: "insufficient_credits",
							message:
								"Copilot needs more credits. Add credits and start a new chat, or start a new chat after your allowance resets.",
						},
					}),
				);
				writeCopilotMetric(
					this.env,
					"usage_reconcile_failed",
					{ ...identity, source: "agent" },
					identity.conversationId,
					{ blobs: ["insufficient_credits"], doubles: [this.totalUsageTokens] },
				);
				return;
			}
			throw error;
		}
		writeCopilotMetric(
			this.env,
			"usage_reconciled",
			{ ...identity, source: "agent" },
			identity.conversationId,
			{
				blobs: [charge.mode],
				doubles: [this.totalUsageTokens, charge.bracketCreditsCharged],
			},
		);
		await this.broadcastSessionUsageUpdate(
			identity,
			this.sessionMessageCount,
			charge.bracketCreditsCharged,
		);
		this.maybeEmitSessionLimitWarning(
			this.totalUsageTokens,
			this.sessionMessageCount,
		);
		if (charge.mode === "onboarding_briefing" && !charge.onboardingConsumed) {
			if (this.onboardingTurnDenied) {
				this.onboardingTurnDenied = false;
				this.onboardingShouldCountTurn = false;
				this.onboardingActiveTurn = null;
				return;
			}
			if (!this.onboardingShouldCountTurn) {
				return;
			}
			// Multi-step tool loops re-enter beforeTurn; only burn the grant when
			// this user turn is finished (not after the first tool step).
			if (
				isOnboardingAgentStepContinuing({
					finishReason: ctx.finishReason,
					toolCallsLength: ctx.toolCalls?.length ?? 0,
				})
			) {
				return;
			}
			this.onboardingShouldCountTurn = false;
			this.onboardingActiveTurn = null;
			const nextTurnsUsed = (charge.onboardingTurnsUsed ?? 0) + 1;
			const consumed = isOnboardingBriefingExhausted(nextTurnsUsed);
			const nextCharge = {
				...charge,
				modelPreset: ONBOARDING_BRIEFING_MODEL_PRESET,
				onboardingTurnsUsed: nextTurnsUsed,
				onboardingConsumed: consumed,
			};
			await persistConversationCharge(
				this.env,
				identity.organizationId,
				identity.conversationId,
				nextCharge,
			);
			if (consumed) {
				await finalizeOnboardingBriefing(this.env, identity.userId);
				writeCopilotMetric(
					this.env,
					"onboarding_briefing_completed",
					{ ...identity, source: "agent" },
					identity.conversationId,
				);
			} else {
				writeCopilotMetric(
					this.env,
					"onboarding_briefing_turn_completed",
					{ ...identity, source: "agent" },
					identity.conversationId,
					{ doubles: [nextTurnsUsed] },
				);
			}
		}
	}

	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === "/internal/purge") {
			const expected = purgeSecret(this.env);
			const received = request.headers.get("X-Ration-Purge-Token");
			if (!expected || received !== expected) {
				return new Response("Forbidden", { status: 403 });
			}
			await this._cf_scheduleDestroy();
			return new Response(null, { status: 204 });
		}
		return super.fetch(request);
	}
}

export default {
	async fetch(
		request: Request,
		env: Cloudflare.Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "OPTIONS") {
			if (!isTrustedOrigin(request, env)) {
				return new Response(null, { status: 403 });
			}
			return new Response(null, {
				status: 204,
				headers: corsHeaders(request, env),
			});
		}
		if (!url.pathname.startsWith("/copilot")) {
			return new Response("Not Found", { status: 404 });
		}
		if (!isTrustedOrigin(request, env)) {
			return new Response("Forbidden", { status: 403 });
		}

		try {
			const identity = await authenticateCopilot(env, request);
			const flagContext = buildFlagContext(request, env, {
				user: { id: identity.userId },
			});
			const enabled = await isFeatureEnabled(
				env,
				"ration-copilot",
				flagContext,
			);
			if (!enabled) {
				return new Response("Not Found", { status: 404 });
			}

			const rl = await checkRateLimit(
				env.RATION_KV,
				"copilot_connect",
				identity.userId,
			);
			if (!rl.allowed) {
				return jsonResponse(
					request,
					env,
					{ error: "rate_limited" },
					{
						status: 429,
						headers: { "Retry-After": String(rl.retryAfter ?? 5) },
					},
				);
			}

			const conversationId = parseConversationId(url);
			const charge = await ensureCopilotConversationOpen(
				env,
				identity,
				conversationId,
				{
					request,
					source: identity.source,
				},
			);
			if (charge.mode === "onboarding_briefing") {
				writeCopilotMetric(
					env,
					"onboarding_briefing_started",
					identity,
					conversationId,
				);
			}
			const agentName = encodeAgentName({ ...identity, conversationId });
			ctx.waitUntil(
				Promise.all(
					[
						`copilot:user-conversation:${identity.userId}:${conversationId}`,
						`copilot:org-conversation:${identity.organizationId}:${conversationId}`,
					].map((key) =>
						env.RATION_KV.put(key, agentName, {
							expirationTtl: 60 * 60 * 24 * 30,
						}),
					),
				),
			);
			writeCopilotMetric(env, "conversation_open", identity, conversationId);
			const routedUrl = new URL(request.url);
			// PartyServer resolves the namespace segment via
			// camelCaseToKebabCase(bindingName). The Durable Object binding is
			// "PROJECT_THINK", which maps to "project-think". This must match the
			// binding name (not the class name) or routing returns 400.
			routedUrl.pathname = `/agents/project-think/${agentName}`;
			const routedRequest = new Request(routedUrl, request);
			const response = await routeAgentRequest(routedRequest, env, {
				cors: true,
			});
			return response ?? new Response("Not Found", { status: 404 });
		} catch (error) {
			if (error instanceof CopilotNeedsConsentError) {
				return jsonResponse(
					request,
					env,
					{ error: "copilot_consent_required", resetAt: error.resetAt },
					{ status: 402 },
				);
			}
			if (error instanceof InsufficientCreditsError) {
				return jsonResponse(
					request,
					env,
					{ error: "insufficient_credits", required: error.required },
					{ status: 402 },
				);
			}
			if (
				error instanceof Error &&
				error.message === "invalid_conversation_id"
			) {
				return jsonResponse(
					request,
					env,
					{ error: "invalid_conversation_id" },
					{ status: 400 },
				);
			}
			if (
				error instanceof Error &&
				(error.message === "copilot_unauthorized" ||
					error.message.includes("mobile access token"))
			) {
				return jsonResponse(
					request,
					env,
					{ error: "unauthorized" },
					{ status: 401 },
				);
			}
			if (error instanceof Error && error.message === "copilot_forbidden_org") {
				return jsonResponse(
					request,
					env,
					{ error: "forbidden_org" },
					{ status: 403 },
				);
			}
			log.error("[Copilot] Worker error", error);
			return jsonResponse(
				request,
				env,
				{ error: "internal_error" },
				{ status: 500 },
			);
		}
	},
} satisfies ExportedHandler<Cloudflare.Env>;
