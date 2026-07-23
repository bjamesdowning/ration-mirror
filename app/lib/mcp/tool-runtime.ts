import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { buildClaimRecoveryPaths } from "../agent/claim.constants";
import { checkRateLimit } from "../rate-limiter.server";
import { auditMcpWrite } from "./audit";
import type { McpToolContext } from "./auth";
import { MCP_TOOL_TIMEOUT_MS } from "./constants";
import {
	err,
	mapErrorToEnvelope,
	rateLimited,
	type ToolEnvelope,
	toolReply,
} from "./envelope";
import { recordMcpToolMetric } from "./metrics";
import { McpScopeError, requireScope } from "./scopes";

export type McpToolsEnv = Cloudflare.Env & { __mcp: McpToolContext };

export type McpRateLimitCategory =
	| "mcp_list"
	| "mcp_search"
	| "mcp_write"
	| "mcp_supply_sync"
	| "mcp_delegated_read"
	| "mcp_delegated_write"
	| null;

/** Org-level categories that also get a per-credential mutation cap. */
const MCP_MUTATION_RATE_LIMIT_CATEGORIES = new Set<string>([
	"mcp_write",
	"mcp_supply_sync",
]);

function resolveOrgRateLimitCategory(
	category: NonNullable<McpRateLimitCategory>,
	preClaim: boolean,
): string {
	if (preClaim && MCP_MUTATION_RATE_LIMIT_CATEGORIES.has(category)) {
		return "mcp_write_preclaim";
	}
	return category;
}

function resolvePerKeyRateLimitCategory(preClaim: boolean): string {
	return preClaim ? "mcp_write_preclaim_per_key" : "mcp_write_per_key";
}

export type MakeToolOptions<TArgs extends Record<string, unknown>, TData> = {
	name: string;
	scopes: Parameters<typeof requireScope>[1];
	rateLimitCategory: McpRateLimitCategory;
	audit: boolean;
	/**
	 * Per-tool wall clock. `null` disables the race (credit/queue jobs).
	 * Defaults to MCP_TOOL_TIMEOUT_MS.
	 */
	timeoutMs?: number | null;
	handler: (ctx: McpToolContext, args: TArgs) => Promise<ToolEnvelope<TData>>;
};

type SharedToolApproval<TArgs> =
	| boolean
	| ((args: TArgs) => boolean | PromiseLike<boolean>);

/**
 * A transport-neutral tool definition shared by MCP and Copilot adapters.
 *
 * The object schema is kept intact for consumers such as the AI SDK, while
 * MCP registration uses its raw shape to preserve the existing wire contract.
 */
export type SharedToolDefinition = {
	name: string;
	description: string;
	inputSchema: z.ZodObject;
	scopes: Parameters<typeof requireScope>[1];
	rateLimitCategory: McpRateLimitCategory;
	audit: boolean;
	needsApproval?: SharedToolApproval<Record<string, unknown>>;
	/** Override default tool timeout; `null` disables (credit/queue jobs). */
	timeoutMs?: number | null;
	handler: (
		ctx: McpToolContext,
		args: Record<string, unknown>,
	) => Promise<ToolEnvelope<unknown>>;
};

/** Preserve schema-derived handler inference when declaring a tool. */
export function defineSharedTool<TInputSchema extends z.ZodObject, TData>(
	definition: Omit<
		SharedToolDefinition,
		"inputSchema" | "handler" | "needsApproval"
	> & {
		inputSchema: TInputSchema;
		needsApproval?: SharedToolApproval<z.output<TInputSchema>>;
		handler: (
			ctx: McpToolContext,
			args: z.output<TInputSchema>,
		) => Promise<ToolEnvelope<TData>>;
	},
): SharedToolDefinition {
	const approval = definition.needsApproval;
	const needsApproval =
		typeof approval === "function"
			? (args: Record<string, unknown>) =>
					approval(definition.inputSchema.parse(args))
			: approval;

	return {
		...definition,
		needsApproval,
		// MCP and AI SDK adapters validate against inputSchema before execution.
		// The generic declaration above keeps the handler coupled to that schema.
		handler: (ctx, args) =>
			definition.handler(ctx, args as z.output<TInputSchema>),
	};
}

/**
 * Run a tool handler through the shared MCP/copilot middleware.
 *
 * This returns the transport-neutral envelope. MCP wraps the envelope with
 * `toolReply`; Copilot returns the same envelope shape to the model.
 */
export async function runTool<TArgs extends Record<string, unknown>, TData>(
	env: McpToolsEnv,
	opts: MakeToolOptions<TArgs, TData>,
	args: TArgs,
): Promise<ToolEnvelope<TData>> {
	const startedAt = Date.now();
	const ctx = env.__mcp;

	try {
		requireScope(ctx, opts.scopes);
	} catch (e) {
		if (e instanceof McpScopeError) {
			return err(opts.name, "insufficient_scope", e.message, {
				details: { required: e.required },
			}) as ToolEnvelope<TData>;
		}
		throw e;
	}

	if (opts.rateLimitCategory) {
		const orgCategory = resolveOrgRateLimitCategory(
			opts.rateLimitCategory,
			ctx.preClaim,
		);
		const orgRl = await checkRateLimit(
			env.RATION_KV,
			orgCategory as Parameters<typeof checkRateLimit>[1],
			ctx.organizationId,
		);
		if (!orgRl.allowed) {
			if (opts.audit) {
				auditMcpWrite(ctx, {
					tool: opts.name,
					outcome: "error",
					errorCode: "rate_limited",
					durationMs: Date.now() - startedAt,
				});
			}
			return rateLimited(
				opts.name,
				orgRl.retryAfter ?? 60,
			) as ToolEnvelope<TData>;
		}

		if (
			opts.rateLimitCategory &&
			MCP_MUTATION_RATE_LIMIT_CATEGORIES.has(opts.rateLimitCategory)
		) {
			const keyCategory = resolvePerKeyRateLimitCategory(ctx.preClaim);
			const keyRl = await checkRateLimit(
				env.RATION_KV,
				keyCategory as Parameters<typeof checkRateLimit>[1],
				ctx.apiKeyId,
			);
			if (!keyRl.allowed) {
				if (opts.audit) {
					auditMcpWrite(ctx, {
						tool: opts.name,
						outcome: "error",
						errorCode: "rate_limited",
						durationMs: Date.now() - startedAt,
					});
				}
				return rateLimited(
					opts.name,
					keyRl.retryAfter ?? 60,
				) as ToolEnvelope<TData>;
			}
		}
	}

	try {
		const timeoutMs =
			opts.timeoutMs === undefined ? MCP_TOOL_TIMEOUT_MS : opts.timeoutMs;
		const handlerPromise = opts.handler(ctx, args);

		let envelope: ToolEnvelope<TData>;
		if (timeoutMs === null) {
			envelope = await handlerPromise;
		} else {
			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			let timedOut = false;
			envelope = await Promise.race([
				handlerPromise,
				new Promise<ToolEnvelope<TData>>((resolve) => {
					timeoutId = setTimeout(() => {
						timedOut = true;
						resolve(
							err(
								opts.name,
								"timeout",
								`Tool ${opts.name} exceeded ${timeoutMs}ms and was aborted.`,
								{
									recoveryHint:
										"Retry with a smaller payload, or try again shortly. If this persists, use the native Ration screen for this action.",
								},
							) as ToolEnvelope<TData>,
						);
					}, timeoutMs);
				}),
			]).finally(() => {
				if (timeoutId !== undefined) clearTimeout(timeoutId);
			});
			// Keep the in-flight handler alive after timeout so writes/embeds can finish.
			if (timedOut && ctx.waitUntil) {
				ctx.waitUntil(
					handlerPromise.catch(() => {
						/* logged by handler / mapError paths if rethrown */
					}),
				);
			}
		}
		if (envelope.ok && opts.audit && ctx.preClaim && env.BETTER_AUTH_URL) {
			const origin = env.BETTER_AUTH_URL.replace(/\/$/, "");
			const recovery = buildClaimRecoveryPaths(origin);
			envelope.meta = {
				...envelope.meta,
				claimNudge: {
					claimPage: recovery.claimPage,
					reissueClaimUri: recovery.reissueClaimUri,
					claimRequiredForOwnership: true,
				},
			};
		}
		if (opts.audit) {
			auditMcpWrite(ctx, {
				tool: opts.name,
				outcome: envelope.ok ? "ok" : "error",
				errorCode: envelope.ok ? undefined : envelope.error.code,
				durationMs: Date.now() - startedAt,
			});
		}
		const durationMs = Date.now() - startedAt;
		if (!envelope.ok && envelope.error.code === "timeout") {
			recordMcpToolMetric({
				type: "tool_timeout",
				tool: opts.name,
				durationMs,
			});
		} else {
			recordMcpToolMetric({
				type: "tool_complete",
				tool: opts.name,
				ok: envelope.ok,
				durationMs,
				errorCode: envelope.ok ? undefined : envelope.error.code,
			});
		}
		return envelope;
	} catch (e) {
		const origin = (env.BETTER_AUTH_URL ?? "").replace(/\/$/, "") || undefined;
		const envelope = mapErrorToEnvelope(opts.name, e, {
			preClaim: ctx.preClaim,
			origin,
		});
		if (opts.audit) {
			auditMcpWrite(ctx, {
				tool: opts.name,
				outcome: "error",
				errorCode: envelope.ok ? undefined : envelope.error.code,
				durationMs: Date.now() - startedAt,
			});
		}
		recordMcpToolMetric({
			type: "tool_complete",
			tool: opts.name,
			ok: false,
			durationMs: Date.now() - startedAt,
			errorCode: envelope.ok ? undefined : envelope.error.code,
		});
		return envelope as ToolEnvelope<TData>;
	}
}

/**
 * Wrap a tool handler to enforce scope, rate limit, audit logging, and the
 * standard error envelope. Read-tools and write-tools both go through this.
 */
export function makeTool<TArgs extends Record<string, unknown>, TData>(
	opts: MakeToolOptions<TArgs, TData>,
): (
	env: McpToolsEnv,
	args: TArgs,
) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
	return async (env, args) => {
		const envelope = await runTool(env, opts, args);
		return toolReply(opts.name, envelope);
	};
}

/** Register one shared definition with the MCP transport adapter. */
export function registerSharedMcpTool(
	server: McpServer,
	env: McpToolsEnv,
	definition: SharedToolDefinition,
): void {
	const handler = makeTool({
		name: definition.name,
		scopes: definition.scopes,
		rateLimitCategory: definition.rateLimitCategory,
		audit: definition.audit,
		timeoutMs: definition.timeoutMs,
		handler: definition.handler,
	});
	server.tool(
		definition.name,
		definition.description,
		definition.inputSchema.shape,
		async (args) => handler(env, args),
	);
}
