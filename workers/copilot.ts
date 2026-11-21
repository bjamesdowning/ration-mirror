// First import. See workers/zod-init.ts. Do not reorder.
import "./zod-init";
import {
	type ChatErrorClassification,
	type ChatErrorContext,
	type ChatRecoveryContext,
	type ChatRecoveryExhaustedContext,
	type ChatRecoveryOptions,
	type ChatResponseResult,
	type PrepareStepContext,
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
import { formatCopilotTemporalContextForOrganization } from "../app/lib/agent/temporal-context.server";
import { getUserSettings } from "../app/lib/auth.server";
import {
	type CopilotWriteCarryForwardDomain,
	type CopilotWriteCarryForwardEntry,
	liveCarryForwardDomains,
	nextCarryForwardEntries,
	resolveCopilotActiveTools,
} from "../app/lib/copilot/active-tools.server";
import { authenticateCopilot } from "../app/lib/copilot/auth.server";
import {
	COPILOT_GATEWAY_REQUEST_TIMEOUT_MS,
	COPILOT_RECOVERY_TERMINAL_MESSAGE,
	classifyCopilotChatError,
	copilotClientNeedsStallDecline,
	copilotFinalStepConfig,
	createCopilotChatRecoveryConfig,
	isCopilotEmptyTurn,
	isCopilotLiveTurn,
} from "../app/lib/copilot/chat-recovery";
import {
	COPILOT_SESSION_MAX_MESSAGES,
	COPILOT_SESSION_MAX_TOKENS,
	ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS,
} from "../app/lib/copilot/constants";
import {
	COPILOT_DEFLECTION_NUDGE,
	detectConfirmWithoutApply,
	detectCopilotDeflection,
} from "../app/lib/copilot/deflection.server";
import {
	CopilotNeedsConsentError,
	ensureCopilotConversationOpen,
	getConversationCharge,
	persistConversationCharge,
	reconcileAndPersistCopilotConversationUsage,
} from "../app/lib/copilot/gate.server";
import { copilotInferenceErrorContext } from "../app/lib/copilot/inference-error";
import { detectBlockedCopilotIntent } from "../app/lib/copilot/intent-guard.server";
import { createCopilotGatewayModel } from "../app/lib/copilot/model.server";
import {
	COPILOT_MODEL_PRESETS,
	type CopilotModelPreset,
	copilotTurnInference,
	ONBOARDING_BRIEFING_MODEL_PRESET,
	resolveCopilotModelPreset,
} from "../app/lib/copilot/model-profiles";
import {
	detectNativeFeatureSuggestion,
	formatNativeFeatureAdvisory,
	type NativeFeatureClientSource,
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
	type CopilotOriginatingClient,
	inferCopilotAuthSource,
	resolveCopilotOriginatingClient,
} from "../app/lib/copilot/originating-client.server";
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
import { countUserMessages, lastUserText } from "../app/lib/copilot/turn-text";
import {
	copilotBillingBlockAfterBalanceCheck,
	copilotStepExceedsBalance,
	copilotTurnUsageDecision,
	copilotUsageAfterInsufficientCredits,
} from "../app/lib/copilot/turn-usage";
import { InvalidRationClientHeaderError } from "../app/lib/feature-flags/context.server";
import {
	buildAgentFlagContext,
	buildMobileFlagContext,
	buildWebFlagContext,
	isFeatureEnabled,
} from "../app/lib/feature-flags/flags.server";
import {
	checkBalance,
	InsufficientCreditsError,
} from "../app/lib/ledger.server";
import { log, redactId } from "../app/lib/logging.server";
import {
	isNutritionFastLogEnabled,
	isNutritionSavedFoodEnabled,
} from "../app/lib/nutrition/fast-log-flag.server";
import { fetchLogContext, runWithOpsEnv } from "../app/lib/ops-context.server";
import { checkRateLimit } from "../app/lib/rate-limiter.server";
import { APP_VERSION } from "../app/lib/version";

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

type CopilotAgentUsageConfig = {
	totalUsageTokens: number;
	sessionWarningsEmitted: SessionLimitWarningSeverity[];
	/** Must match CopilotConversationCharge.openedAt for the active KV charge. */
	chargeOpenedAt?: number;
	/** Ask client Flagship identity — survives Durable Object hibernation. */
	originatingPlatform?: "web" | "ios";
	originatingVersion?: string;
	/** Step tokens held until the turn commits or discards. Survives hibernation. */
	uncommittedUsageTokens?: number;
	/** Set when the next bracket is unaffordable. Survives hibernation. */
	billingBlocked?: boolean;
	/** An approved tool already ran in this turn. Survives hibernation. */
	toolRanThisTurn?: boolean;
	/**
	 * Write domains kept open for 15 minutes after a successful preview
	 * (flag `copilot-confirm-scope`). Per conversation DO. Survives hibernation.
	 */
	writeCarryForward?: CopilotWriteCarryForwardEntry[];
};

/** A tool that returned an MCP `ok: false` envelope did not succeed. */
function isFailedToolEnvelope(output: unknown): boolean {
	return (
		typeof output === "object" &&
		output !== null &&
		(output as { ok?: unknown }).ok === false
	);
}

/** `copilot_active_tools` metric path: which beforeTurn branch ran. */
type CopilotTurnPath =
	| "normal"
	| "billing_blocked"
	| "rate_limited"
	| "session_msg_cap"
	| "session_token_cap"
	| "blocked_intent"
	| "onboarding_rate_limited"
	| "onboarding_exhausted"
	| "onboarding_invalid_prompt"
	| "onboarding_turn";

function isCarryForwardEntry(
	value: unknown,
): value is CopilotWriteCarryForwardEntry {
	if (typeof value !== "object" || value === null) return false;
	const entry = value as { domain?: unknown; expiresAt?: unknown };
	return (
		(entry.domain === "inventory" || entry.domain === "manifest") &&
		typeof entry.expiresAt === "number" &&
		Number.isFinite(entry.expiresAt)
	);
}

async function resolveNativeFeatureFlags(
	env: Cloudflare.Env,
	userId: string,
	originating?: CopilotOriginatingClient,
): Promise<NativeFeatureEnabledMap> {
	const flagContext = buildAgentFlagContext(
		env,
		userId,
		"copilot",
		originating,
	);
	const keys = ["ai-scan-receipt", "ai-import-url"] as const;
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
	/** Step tokens not yet billed. Committed when the turn has answer text or tool output. */
	private uncommittedUsageTokens = 0;
	private billingBlocked = false;
	/** Held tokens and the billing block are restored once per isolate wake. */
	private heldUsageRestored = false;
	/** Set in afterToolCall, including the continuation after Approve. */
	private toolRanThisTurn = false;
	/** The canned blocked reply must not raise the credit bracket. */
	private suppressBlockedReplyCharge = false;
	private sessionMessageCount = 0;
	private sessionWarningsEmitted = new Set<SessionLimitWarningSeverity>();
	private conversationModelPreset: CopilotModelPreset = "fast";
	private boundChargeOpenedAt: number | null = null;
	/** Soft-deny onboarding turns must not burn the free grant. */
	private onboardingTurnDenied = false;
	private copilotLanguageModel: ReturnType<
		typeof createCopilotGatewayModel
	> | null = null;
	/** Active allowlisted onboarding turn (for tool hard-allowlist). */
	private onboardingActiveTurn: OnboardingBriefingTurn | null = null;
	/** Count the free grant once per allowlisted user turn (not per agent step). */
	private onboardingShouldCountTurn = false;
	/** Native AI kill-switch map for hints / system prompt (refreshed each turn). */
	private nativeFeatureFlags: NativeFeatureEnabledMap = {
		"ai-scan-receipt": false,
		"ai-import-url": false,
	};
	/** Web vs mobile — drives native-feature link format. */
	private clientSource: NativeFeatureClientSource = "web";
	/** Personal log tools stay hidden until the flag and iOS 1.6 gate pass. */
	private diaryToolsEnabled = false;
	/** Saved-food tools stay hidden until the child flag, parent flag, and iOS 1.6 gate pass. */
	private savedFoodToolsEnabled = false;
	/** Ask client's Flagship identity (web/ios). MCP never inherits this. */
	private originatingClient: CopilotOriginatingClient = {
		clientPlatform: "web",
		clientVersion: APP_VERSION,
	};
	/** Per-turn deflection tracking. */
	private turnToolCallCount = 0;
	private turnUserText = "";
	private turnActiveTools: string[] = [];
	private turnNativeSuggestionMatched = false;
	private turnDeflectionNudged = false;
	private turnDeflectionMetricEmitted = false;
	private turnSystemPrompt = "";
	/** Flag `copilot-confirm-scope`, evaluated in beforeTurn and read lazily. */
	private confirmScopeEnabled = false;
	/** Flag `copilot-recovery-tuning`, evaluated in beforeTurn for in-turn hooks. */
	private recoveryTuningEnabled = false;
	/** When a turn last started in this isolate (0 after a fresh wake). */
	private lastLiveTurnStartedAt = 0;
	private turnMaxSteps = 0;
	private turnPath: CopilotTurnPath = "normal";
	private turnCarriedDomains: CopilotWriteCarryForwardDomain[] = [];
	private turnStepCapMetricEmitted = false;
	private turnBillingStopNotified = false;
	private turnConfirmMetricEmitted = false;
	private writeCarryForward: CopilotWriteCarryForwardEntry[] = [];
	/** Last base prompt handed to Think by getSystemPrompt(). */
	private lastBaseSystemPrompt = "";
	private copilotLanguageModelTuned: ReturnType<
		typeof createCopilotGatewayModel
	> | null = null;

	/**
	 * Static config (Think reads it before onStart). The flag narrows the
	 * budget only for a turn that is live in this isolate; deploy / eviction
	 * recovery in a fresh isolate keeps Think's defaults.
	 */
	override chatRecovery = createCopilotChatRecoveryConfig({
		state: () => ({
			tuningEnabled: this.recoveryTuningEnabled,
			liveTurn: isCopilotLiveTurn(this.lastLiveTurnStartedAt, Date.now()),
		}),
		onExhausted: (ctx) => this.onCopilotRecoveryExhausted(ctx),
	});

	constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
		super(ctx, env);
		// Eagerly migrate Think workflow-notification SQLite so concurrent
		// alarm/drain paths cannot race ahead of lazy CREATE TABLE IF NOT EXISTS.
		void this.ctx.blockConcurrencyWhile(async () => {
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS cf_think_workflow_notifications (
					notification_id TEXT PRIMARY KEY,
					submission_id TEXT NOT NULL,
					workflow_name TEXT NOT NULL,
					workflow_id TEXT NOT NULL,
					event_type TEXT NOT NULL,
					payload_json TEXT NOT NULL,
					attempts INTEGER NOT NULL DEFAULT 0,
					last_error TEXT,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL,
					delivered_at INTEGER
				)
			`);
			try {
				this.ctx.storage.sql.exec(
					"ALTER TABLE cf_think_workflow_notifications ADD COLUMN delivered_at INTEGER",
				);
			} catch (error) {
				const message = (
					error instanceof Error ? error.message : String(error)
				).toLowerCase();
				if (!message.includes("duplicate column")) throw error;
			}
			this.ctx.storage.sql.exec(`
				CREATE INDEX IF NOT EXISTS cf_think_workflow_notifications_created_idx
				ON cf_think_workflow_notifications (delivered_at, created_at, notification_id)
			`);
		});
	}

	private persistUsageConfig(): void {
		this.configure<CopilotAgentUsageConfig>({
			totalUsageTokens: this.totalUsageTokens,
			sessionWarningsEmitted: [...this.sessionWarningsEmitted],
			...(this.boundChargeOpenedAt != null
				? { chargeOpenedAt: this.boundChargeOpenedAt }
				: {}),
			originatingPlatform: this.originatingClient.clientPlatform,
			...(this.originatingClient.clientVersion
				? { originatingVersion: this.originatingClient.clientVersion }
				: {}),
			uncommittedUsageTokens: this.uncommittedUsageTokens,
			billingBlocked: this.billingBlocked,
			toolRanThisTurn: this.toolRanThisTurn,
			writeCarryForward: this.writeCarryForward,
		});
	}

	private resetUsageForCharge(chargeOpenedAt: number, totalTokens = 0): void {
		this.totalUsageTokens = Math.max(0, Math.ceil(totalTokens));
		this.uncommittedUsageTokens = 0;
		this.toolRanThisTurn = false;
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
		if (
			cfg.originatingPlatform === "web" ||
			cfg.originatingPlatform === "ios"
		) {
			this.originatingClient = {
				clientPlatform: cfg.originatingPlatform,
				...(cfg.originatingVersion
					? { clientVersion: cfg.originatingVersion }
					: {}),
			};
			this.clientSource = cfg.originatingPlatform === "ios" ? "mobile" : "web";
		}
		if (!this.heldUsageRestored) {
			this.heldUsageRestored = true;
			if (typeof cfg.uncommittedUsageTokens === "number") {
				this.uncommittedUsageTokens = Math.max(
					0,
					Math.ceil(cfg.uncommittedUsageTokens),
				);
			}
			if (cfg.billingBlocked === true) this.billingBlocked = true;
			if (cfg.toolRanThisTurn === true) this.toolRanThisTurn = true;
			if (Array.isArray(cfg.writeCarryForward)) {
				this.writeCarryForward =
					cfg.writeCarryForward.filter(isCarryForwardEntry);
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
			this.persistUsageConfig();
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
		const originating = resolveCopilotOriginatingClient(
			ctx.request,
			inferCopilotAuthSource(ctx.request),
		);
		this.originatingClient = originating;
		this.clientSource = originating.clientPlatform === "ios" ? "mobile" : "web";
		try {
			const identity = decodeAgentName(this.name);
			const charge = await this.hydrateCumulativeUsage(identity);
			this.originatingClient = originating;
			this.clientSource =
				originating.clientPlatform === "ios" ? "mobile" : "web";
			this.persistUsageConfig();
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
		try {
			if (this.recoveryTuningEnabled) {
				this.copilotLanguageModelTuned ??= createCopilotGatewayModel(this.env, {
					requestTimeoutMs: COPILOT_GATEWAY_REQUEST_TIMEOUT_MS,
					conversationId: decodeAgentName(this.name).conversationId,
				});
				return this.copilotLanguageModelTuned;
			}
			this.copilotLanguageModel ??= createCopilotGatewayModel(this.env);
			return this.copilotLanguageModel;
		} catch (error) {
			log.error("[Copilot] inference failed", error, {
				event: "copilot_inference",
			});
			throw error;
		}
	}

	onChatError(error: unknown, ctx?: ChatErrorContext): unknown {
		log.error("[Copilot] inference failed", error, {
			event: "copilot_inference",
			classification: ctx?.classification,
			...copilotInferenceErrorContext(error),
		});
		return super.onChatError(error, ctx);
	}

	/** Flag on: 429 / 5xx / network reset route into the bounded recovery. */
	override classifyChatError(
		error: unknown,
		_ctx?: ChatErrorContext,
	): ChatErrorClassification | undefined {
		return classifyCopilotChatError(error, this.recoveryTuningEnabled);
	}

	protected override async onChatRecovery(
		ctx: ChatRecoveryContext,
	): Promise<ChatRecoveryOptions> {
		const identity = decodeAgentName(this.name);
		const liveTurn = isCopilotLiveTurn(this.lastLiveTurnStartedAt, Date.now());
		writeCopilotMetric(
			this.env,
			ctx.attempt <= 1 ? "copilot_stall" : "copilot_retry_scheduled",
			{ ...identity, source: "agent" },
			identity.conversationId,
			{
				blobs: [
					ctx.recoveryKind,
					this.conversationModelPreset,
					liveTurn ? "live" : "wake",
					this.recoveryTuningEnabled ? "tuned" : "default",
				],
				doubles: [ctx.attempt, Math.max(0, Date.now() - ctx.createdAt)],
			},
		);
		if (
			this.recoveryTuningEnabled &&
			liveTurn &&
			copilotClientNeedsStallDecline(this.originatingClient)
		) {
			// iOS < 1.6.40 ignores frames after the "recovering" done frame, so
			// tell it now while its turn is still active, then decline the retry.
			this.broadcast(
				JSON.stringify({
					type: "error",
					error: {
						code: "copilot_stalled",
						message: COPILOT_RECOVERY_TERMINAL_MESSAGE,
					},
				}),
			);
			return { continue: false };
		}
		return {};
	}

	private onCopilotRecoveryExhausted(ctx: ChatRecoveryExhaustedContext): void {
		try {
			const identity = decodeAgentName(this.name);
			writeCopilotMetric(
				this.env,
				"copilot_recovery_exhausted",
				{ ...identity, source: "agent" },
				identity.conversationId,
				{
					blobs: [ctx.reason, ctx.recoveryKind, this.conversationModelPreset],
					doubles: [ctx.attempt],
				},
			);
		} catch (error) {
			log.error("[Copilot] recovery exhausted metric failed", error);
		}
	}

	getSystemPrompt() {
		this.lastBaseSystemPrompt = getCopilotSystemPrompt(
			this.nativeFeatureFlags,
			{
				confirmScope: this.confirmScopeEnabled,
			},
		);
		return this.lastBaseSystemPrompt;
	}

	/**
	 * Think builds the base prompt before beforeTurn (one-turn flag lag). Swap
	 * in a prompt built from this turn's flags, keeping Think's appended
	 * capability block. Falls back to Think's prompt if it was not ours.
	 */
	private currentTurnSystem(ctxSystem: string): string {
		const fresh = getCopilotSystemPrompt(this.nativeFeatureFlags, {
			confirmScope: this.confirmScopeEnabled,
		});
		const stale = this.lastBaseSystemPrompt;
		if (stale && stale !== fresh && ctxSystem.startsWith(stale)) {
			return `${fresh}${ctxSystem.slice(stale.length)}`;
		}
		return ctxSystem;
	}

	private emitActiveToolsMetric(
		identity: ReturnType<typeof decodeAgentName>,
		activeTools: readonly string[] | undefined,
		userTextLength: number,
	): void {
		const tools = activeTools ?? [];
		writeCopilotMetric(
			this.env,
			"copilot_active_tools",
			{ ...identity, source: "agent" },
			identity.conversationId,
			{
				blobs: [
					this.turnPath,
					this.conversationModelPreset,
					tools.includes("apply_inventory_remove") ? "1" : "0",
					tools.includes("apply_inventory_import") ? "1" : "0",
					tools.includes("commit_manifest_plan") ? "1" : "0",
					this.turnCarriedDomains.length > 0
						? this.turnCarriedDomains.join("+")
						: "none",
				],
				doubles: [tools.length, userTextLength],
			},
		);
	}

	getTools(): ToolSet {
		const identity = decodeAgentName(this.name);
		return toAiSdkTools(
			this.env,
			{
				organizationId: identity.organizationId,
				userId: identity.userId,
				scopes: [...COPILOT_MCP_SCOPES],
				preClaim: false,
				originatingClient: this.originatingClient,
				waitUntil: (promise) => this.ctx.waitUntil(promise),
			},
			{
				onApprovalRequested: (toolName) => {
					writeCopilotMetric(
						this.env,
						"approval_requested",
						{ ...identity, source: "agent" },
						identity.conversationId,
						{ blobs: [toolName] },
					);
				},
				onApprovalResolved: (toolName) => {
					writeCopilotMetric(
						this.env,
						"approval_resolved",
						{ ...identity, source: "agent" },
						identity.conversationId,
						{ blobs: [toolName, "approved"] },
					);
				},
			},
			{
				includeDiaryTools: this.diaryToolsEnabled,
				includeSavedFoodTools: this.savedFoodToolsEnabled,
				// Read at call time so this turn's flag value applies (A5).
				approvalOverride: (toolName) =>
					this.confirmScopeEnabled &&
					(toolName === "apply_inventory_remove" ||
						toolName === "apply_inventory_import")
						? true
						: undefined,
			},
		) as ToolSet;
	}

	async beforeTurn(ctx: TurnContext) {
		this.turnPath = "normal";
		this.turnCarriedDomains = [];
		const config = await this.resolveBeforeTurn(ctx);
		try {
			this.emitActiveToolsMetric(
				decodeAgentName(this.name),
				config.activeTools,
				lastUserText(ctx).length,
			);
		} catch (error) {
			log.error("[Copilot] active tools metric failed", error);
		}
		return config;
	}

	private async resolveBeforeTurn(ctx: TurnContext) {
		const identity = decodeAgentName(this.name);
		this.lastLiveTurnStartedAt = Date.now();
		this.suppressBlockedReplyCharge = false;
		this.nativeFeatureFlags = await resolveNativeFeatureFlags(
			this.env,
			identity.userId,
			this.originatingClient,
		);
		const copilotFlags = buildAgentFlagContext(
			this.env,
			identity.userId,
			"copilot",
			this.originatingClient,
		);
		this.diaryToolsEnabled = await isNutritionFastLogEnabled(
			this.env,
			copilotFlags,
		);
		this.savedFoodToolsEnabled = await isNutritionSavedFoodEnabled(
			this.env,
			copilotFlags,
		);
		[this.confirmScopeEnabled, this.recoveryTuningEnabled] = await Promise.all([
			isFeatureEnabled(this.env, "copilot-confirm-scope", copilotFlags),
			isFeatureEnabled(this.env, "copilot-recovery-tuning", copilotFlags),
		]);
		if (!ctx.continuation) {
			this.turnStepCapMetricEmitted = false;
			this.turnBillingStopNotified = false;
			this.turnConfirmMetricEmitted = false;
		}
		this.sessionMessageCount = ctx.messages.length;
		const charge = await this.hydrateCumulativeUsage(identity);
		if (
			!ctx.continuation &&
			(this.uncommittedUsageTokens !== 0 || this.toolRanThisTurn)
		) {
			this.uncommittedUsageTokens = 0;
			this.toolRanThisTurn = false;
			this.persistUsageConfig();
		}
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
				this.turnPath = "onboarding_rate_limited";
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
				this.turnPath = "onboarding_exhausted";
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
				this.turnPath = "onboarding_invalid_prompt";
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

			this.turnPath = "onboarding_turn";
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
			const inference = copilotTurnInference(profile);
			const maxOutputTokens =
				briefingTurn === "bootstrap"
					? ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS
					: profile.maxOutputTokens;

			return {
				system: `${ctx.system}${await formatCopilotTemporalContextForOrganization(this.env.DB, identity.organizationId)}${getOnboardingBriefingSystemPromptAppend(briefingTurn)}`,
				activeTools: policy.activeTools,
				maxSteps: policy.maxSteps,
				maxOutputTokens,
				sendReasoning: inference.sendReasoning,
				providerOptions: inference.providerOptions,
				chatStreamStallTimeoutMs: inference.chatStreamStallTimeoutMs,
			};
		}
		if (this.billingBlocked && charge) {
			const creditBalance =
				charge.mode === "credits"
					? await checkBalance(this.env, identity.organizationId)
					: 0;
			const stillBlocked = copilotBillingBlockAfterBalanceCheck({
				blocked: true,
				mode: charge.mode,
				totalTokens: this.totalUsageTokens,
				pendingTokens: this.uncommittedUsageTokens,
				bracketCreditsCharged: charge.bracketCreditsCharged,
				creditBalance,
			});
			if (!stillBlocked) {
				this.billingBlocked = false;
				this.persistUsageConfig();
			}
		}
		if (this.billingBlocked) {
			this.turnPath = "billing_blocked";
			this.suppressBlockedReplyCharge = true;
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
			this.turnPath = "rate_limited";
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
			this.turnPath = "session_msg_cap";
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
			this.turnPath = "session_token_cap";
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
			this.turnPath = "blocked_intent";
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
		// Act-first advisory: disclose native UX only after tools; keep tools available.
		const nativeAdvisory = nativeSuggestion
			? formatNativeFeatureAdvisory(nativeSuggestion, this.clientSource)
			: "";

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
		const inference = copilotTurnInference(profile);

		const carryForward = this.confirmScopeEnabled
			? liveCarryForwardDomains(this.writeCarryForward, Date.now())
			: [];
		this.turnCarriedDomains = carryForward;
		const scopedTools = resolveCopilotActiveTools(
			Object.keys(ctx.tools),
			userText,
			{ carryForward, wordForms: this.confirmScopeEnabled },
		);

		this.turnToolCallCount = 0;
		this.turnUserText = userText;
		this.turnActiveTools = scopedTools;
		this.turnNativeSuggestionMatched = nativeSuggestion != null;
		this.turnDeflectionNudged = false;
		this.turnDeflectionMetricEmitted = false;
		this.turnSystemPrompt = `${this.currentTurnSystem(ctx.system)}${nativeAdvisory}${await formatCopilotTemporalContextForOrganization(this.env.DB, identity.organizationId)}`;
		this.turnMaxSteps = inference.maxSteps;

		return {
			system: this.turnSystemPrompt,
			activeTools: scopedTools,
			maxSteps: inference.maxSteps,
			maxOutputTokens: inference.maxOutputTokens,
			sendReasoning: inference.sendReasoning,
			providerOptions: inference.providerOptions,
			chatStreamStallTimeoutMs: inference.chatStreamStallTimeoutMs,
			stopWhen: () => this.billingBlocked,
		};
	}

	beforeStep(ctx: PrepareStepContext) {
		let system: string | undefined;
		// After a no-tool first step, reinforce once if steps continue.
		if (
			ctx.stepNumber > 0 &&
			!this.turnDeflectionNudged &&
			detectCopilotDeflection({
				toolCallCount: this.turnToolCallCount,
				activeTools: this.turnActiveTools,
				userText: this.turnUserText,
				nativeSuggestionMatched: this.turnNativeSuggestionMatched,
			})
		) {
			this.turnDeflectionNudged = true;
			system = `${this.turnSystemPrompt}\n\n${COPILOT_DEFLECTION_NUDGE}`;
		}
		// Flag on: the last allowed step must answer, never end on a tool call.
		if (this.recoveryTuningEnabled && this.turnMaxSteps > 0) {
			const finalStep = copilotFinalStepConfig({
				stepNumber: ctx.stepNumber,
				maxSteps: this.turnMaxSteps,
				system: system ?? this.turnSystemPrompt,
			});
			if (finalStep) {
				if (!this.turnStepCapMetricEmitted) {
					this.turnStepCapMetricEmitted = true;
					const identity = decodeAgentName(this.name);
					writeCopilotMetric(
						this.env,
						"copilot_step_cap",
						{ ...identity, source: "agent" },
						identity.conversationId,
						{
							blobs: [this.conversationModelPreset],
							doubles: [ctx.stepNumber, this.turnMaxSteps],
						},
					);
				}
				return finalStep;
			}
		}
		if (system) return { system };
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
		this.turnToolCallCount += 1;
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
		this.toolRanThisTurn = true;
		if (this.confirmScopeEnabled) {
			this.writeCarryForward = nextCarryForwardEntries(
				this.writeCarryForward,
				ctx.toolName,
				ctx.success && !isFailedToolEnvelope(ctx.output),
				Date.now(),
			);
		}
		this.persistUsageConfig();
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
		if (
			!this.turnDeflectionMetricEmitted &&
			detectCopilotDeflection({
				toolCallCount: this.turnToolCallCount,
				activeTools: this.turnActiveTools,
				userText: this.turnUserText,
				nativeSuggestionMatched: this.turnNativeSuggestionMatched,
			})
		) {
			this.turnDeflectionMetricEmitted = true;
			writeCopilotMetric(
				this.env,
				"copilot_deflection",
				{ ...identity, source: "agent" },
				identity.conversationId,
				{
					blobs: [
						this.turnNativeSuggestionMatched ? "native_hint" : "action_verb",
						this.conversationModelPreset,
					],
				},
			);
		}
		const usageTokens =
			ctx.usage.totalTokens ??
			(ctx.usage.inputTokens ?? 0) + (ctx.usage.outputTokens ?? 0);
		const charge = await this.hydrateCumulativeUsage(identity);
		this.uncommittedUsageTokens += Math.max(0, Math.ceil(usageTokens));
		if (charge?.mode === "credits") {
			const creditBalance = await checkBalance(
				this.env,
				identity.organizationId,
			);
			if (
				copilotStepExceedsBalance({
					mode: charge.mode,
					totalTokens: this.totalUsageTokens,
					pendingTokens: this.uncommittedUsageTokens,
					bracketCreditsCharged: charge.bracketCreditsCharged,
					creditBalance,
				})
			) {
				this.billingBlocked = true;
				this.notifyBillingStop(identity);
			}
		}
		this.persistUsageConfig();
		if (charge?.mode === "onboarding_briefing" && !charge.onboardingConsumed) {
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

	/**
	 * Flag `copilot-recovery-tuning`: the credit check stopped the turn
	 * mid-stream. Say so once per turn instead of ending silently.
	 */
	private notifyBillingStop(identity: ReturnType<typeof decodeAgentName>) {
		if (!this.recoveryTuningEnabled || this.turnBillingStopNotified) return;
		this.turnBillingStopNotified = true;
		this.broadcast(
			JSON.stringify({
				type: "error",
				error: {
					code: "billing_stopped",
					message:
						"Copilot stopped because this chat ran out of credits. Add credits and start a new chat.",
				},
			}),
		);
		writeCopilotMetric(
			this.env,
			"copilot_billing_stop",
			{ ...identity, source: "agent" },
			identity.conversationId,
			{ blobs: [this.conversationModelPreset] },
		);
	}

	private emitTurnOutcomeMetrics(result: ChatResponseResult) {
		const identity = decodeAgentName(this.name);
		if (
			isCopilotEmptyTurn({
				status: result.status,
				parts: result.message.parts,
			})
		) {
			writeCopilotMetric(
				this.env,
				"copilot_empty_turn",
				{ ...identity, source: "agent" },
				identity.conversationId,
				{ blobs: [this.conversationModelPreset, this.turnPath] },
			);
		}
		if (
			!this.turnConfirmMetricEmitted &&
			detectConfirmWithoutApply({
				carriedDomains: this.turnCarriedDomains,
				toolCallCount: this.turnToolCallCount,
				userText: this.turnUserText,
			})
		) {
			this.turnConfirmMetricEmitted = true;
			writeCopilotMetric(
				this.env,
				"confirm_without_apply",
				{ ...identity, source: "agent" },
				identity.conversationId,
				{
					blobs: [
						this.turnCarriedDomains.join("+"),
						this.conversationModelPreset,
					],
				},
			);
		}
	}

	async onChatResponse(result: ChatResponseResult) {
		try {
			this.emitTurnOutcomeMetrics(result);
		} catch (error) {
			log.error("[Copilot] turn outcome metrics failed", error);
		}
		const toolRan = this.toolRanThisTurn;
		const suppressCommit = this.suppressBlockedReplyCharge;
		const decision = copilotTurnUsageDecision({
			status: result.status,
			parts: result.message.parts,
			toolRan,
			suppressCommit,
		});
		this.toolRanThisTurn = false;
		this.suppressBlockedReplyCharge = false;
		if (decision === "discard") {
			this.uncommittedUsageTokens = 0;
			this.persistUsageConfig();
			return;
		}
		if (decision !== "commit") {
			if (toolRan || suppressCommit) this.persistUsageConfig();
			return;
		}
		if (toolRan) this.persistUsageConfig();
		await this.commitUncommittedUsage();
	}

	private async commitUncommittedUsage() {
		const pending = this.uncommittedUsageTokens;
		if (pending <= 0) return;
		this.uncommittedUsageTokens = 0;
		const identity = decodeAgentName(this.name);
		this.totalUsageTokens = resolveCumulativeUsageTokens({
			memory: this.totalUsageTokens + pending,
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
			this.billingBlocked = false;
			this.persistUsageConfig();
		} catch (error) {
			if (error instanceof InsufficientCreditsError) {
				const next = copilotUsageAfterInsufficientCredits({
					billingBlocked: this.billingBlocked,
				});
				this.billingBlocked = next.billingBlocked;
				if (next.persist) this.persistUsageConfig();
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
		return runWithOpsEnv(
			env,
			async () => {
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
					const flagSession = { user: { id: identity.userId } };
					const flagContext =
						identity.source === "mobile"
							? buildMobileFlagContext(request, env, flagSession)
							: buildWebFlagContext(request, env, flagSession);
					const featureEnablementOn = await isFeatureEnabled(
						env,
						"feature-enablement-consent",
						flagContext,
					);
					// Mobile always requires AI consent; web only when feature-enablement-consent is on.
					if (identity.source === "mobile" || featureEnablementOn) {
						const settings = await getUserSettings(env.DB, identity.userId);
						const consentAt = settings.aiConsentAt;
						if (
							typeof consentAt !== "string" ||
							consentAt.trim().length === 0
						) {
							return jsonResponse(
								request,
								env,
								{ error: "ai_consent_required" },
								{ status: 403 },
							);
						}
					}
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
					writeCopilotMetric(
						env,
						"conversation_open",
						identity,
						conversationId,
					);
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
					if (error instanceof InvalidRationClientHeaderError) {
						return jsonResponse(
							request,
							env,
							{ error: error.message, code: "invalid_client_header" },
							{ status: 400 },
						);
					}
					if (
						error instanceof Error &&
						error.message === "copilot_forbidden_org"
					) {
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
			fetchLogContext(request, "ration-copilot"),
		);
	},
} satisfies ExportedHandler<Cloudflare.Env>;
