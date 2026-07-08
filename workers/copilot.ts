import {
	type StepContext,
	Think,
	type ToolCallContext,
	type ToolCallResultContext,
	type TurnContext,
} from "@cloudflare/think";
import { routeAgentRequest } from "agents";
import type { ToolSet } from "ai";
import { authenticateCopilot } from "../app/lib/copilot/auth.server";
import {
	COPILOT_SESSION_MAX_MESSAGES,
	COPILOT_SESSION_MAX_TOKENS,
} from "../app/lib/copilot/constants";
import {
	CopilotNeedsConsentError,
	ensureCopilotConversationOpen,
	reconcileAndPersistCopilotConversationUsage,
} from "../app/lib/copilot/gate.server";
import { detectBlockedCopilotIntent } from "../app/lib/copilot/intent-guard.server";
import {
	COPILOT_MCP_SCOPES,
	toAiSdkTools,
} from "../app/lib/copilot/tools.server";
import {
	buildFlagContext,
	isFeatureEnabled,
} from "../app/lib/feature-flags/flags.server";
import { InsufficientCreditsError } from "../app/lib/ledger.server";
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

export class ProjectThinkAgent extends Think<Cloudflare.Env> {
	workspaceBash = false;
	private totalUsageTokens = 0;

	getModel() {
		return "@cf/moonshotai/kimi-k2.6";
	}

	getSystemPrompt() {
		return [
			"You are Ration Copilot, a first-party assistant for Ration's orbital supply-chain pantry app.",
			"Use tools for factual app state and kitchen mutations. Never ask the user for organization ids or trust client-supplied org ids.",
			"Do not mimic paid AI features: scan receipts/images, generate recipes, import recipe URLs, or build AI weekly plans. When asked, explain the native flow and provide the matching deep link.",
			"Before destructive or high-impact changes, explain the action and wait for explicit user confirmation if a tool requires confirmation.",
			"Keep responses concise, precise, and optimistic. Use Markdown for lists and steps.",
		].join("\n");
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
		const blocked = detectBlockedCopilotIntent(lastUserText(ctx));
		if (!blocked) {
			return {
				activeTools: Object.keys(ctx.tools),
				maxSteps: 6,
			};
		}
		writeCopilotMetric(
			this.env,
			"blocked_feature",
			{ ...identity, source: "agent" },
			identity.conversationId,
			{ blobs: [blocked.feature] },
		);
		this.broadcast(
			JSON.stringify({
				type: "blocked_feature",
				blocked,
			}),
		);
		return {
			system: `${ctx.system}\n\nThe current user request is blocked from the copilot tool loop. Respond with this exact guidance in natural language: ${blocked.message} Deep link: ${blocked.deepLink}`,
			activeTools: [],
			maxSteps: 1,
		};
	}

	beforeToolCall(ctx: ToolCallContext) {
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
		this.totalUsageTokens += usageTokens;
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
		} catch (error) {
			if (error instanceof InsufficientCreditsError) {
				this.broadcast(
					JSON.stringify({
						type: "error",
						error: {
							code: "insufficient_credits",
							message:
								"Copilot needs more credits to continue this chat. Add credits or start again after your allowance resets.",
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
			await ensureCopilotConversationOpen(env, identity, conversationId);
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
