import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildClaimRecoveryPaths } from "../agent/claim.constants";
import { checkRateLimit } from "../rate-limiter.server";
import { auditMcpWrite } from "./audit";
import type { McpToolContext } from "./auth";
import {
	err,
	mapErrorToEnvelope,
	rateLimited,
	type ToolEnvelope,
	toolReply,
} from "./envelope";
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
	handler: (ctx: McpToolContext, args: TArgs) => Promise<ToolEnvelope<TData>>;
};

/**
 * Run a tool handler through the shared MCP/copilot middleware.
 *
 * This returns the transport-neutral envelope. MCP wraps the envelope with
 * `toolReply`, while the copilot's AI SDK adapter returns `data` directly to
 * the model.
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
		const envelope = await opts.handler(ctx, args);
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

/** Register an MCP tool schema with the shared envelope handler. */
export function registerMcpTool(
	server: McpServer,
	name: string,
	description: string,
	// biome-ignore lint/suspicious/noExplicitAny: MCP SDK tool schema is a string-keyed Zod map
	schema: Record<string, any>,
	// biome-ignore lint/suspicious/noExplicitAny: handler arity matches SDK
	handler: any,
): void {
	server.tool(name, description, schema, handler);
}
