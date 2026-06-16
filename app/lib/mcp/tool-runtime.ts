import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildClaimRecoveryPaths } from "../agent/claim.constants";
import { checkRateLimit } from "../rate-limiter.server";
import { auditMcpWrite } from "./audit";
import type { McpToolContext } from "./auth";
import {
	isFinDelegationClient,
	McpDelegationError,
	verifyDelegationToken,
} from "./delegation.server";
import {
	err,
	mapErrorToEnvelope,
	rateLimited,
	type ToolEnvelope,
	toolReply,
} from "./envelope";
import { hasScope, McpScopeError, requireScope } from "./scopes";

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

type ToolArgsWithActorToken = { actor_token?: string };

function stripActorToken<T extends Record<string, unknown>>(
	args: T,
): { actorToken?: string; toolArgs: Omit<T, "actor_token"> } {
	const { actor_token, ...toolArgs } = args as T & ToolArgsWithActorToken;
	return {
		actorToken: typeof actor_token === "string" ? actor_token : undefined,
		toolArgs: toolArgs as Omit<T, "actor_token">,
	};
}

function isDelegateCaller(env: Cloudflare.Env, ctx: McpToolContext): boolean {
	return (
		ctx.authMethod === "oauth" &&
		hasScope(ctx, "mcp:delegate") &&
		isFinDelegationClient(env, ctx.oauthClientId)
	);
}

async function resolveToolContext(
	env: Cloudflare.Env,
	baseCtx: McpToolContext,
	actorToken: string | undefined,
): Promise<McpToolContext> {
	const delegateCaller = isDelegateCaller(env, baseCtx);

	if (actorToken && !delegateCaller) {
		throw new McpDelegationError(
			"delegation_not_allowed",
			"Delegation not allowed for this credential",
		);
	}

	if (delegateCaller) {
		if (!actorToken) {
			throw new McpDelegationError(
				"actor_token_required",
				"Actor token required for delegated access",
			);
		}
		const subject = await verifyDelegationToken(env, actorToken);
		return {
			...baseCtx,
			userId: subject.userId,
			organizationId: subject.organizationId,
			delegation: {
				actorClientId: baseCtx.oauthClientId ?? baseCtx.apiKeyId,
				subjectUserId: subject.userId,
				subjectOrganizationId: subject.organizationId,
			},
		};
	}

	return baseCtx;
}

export type MakeToolOptions<TArgs extends Record<string, unknown>, TData> = {
	name: string;
	scopes: Parameters<typeof requireScope>[1];
	rateLimitCategory: McpRateLimitCategory;
	audit: boolean;
	handler: (ctx: McpToolContext, args: TArgs) => Promise<ToolEnvelope<TData>>;
};

/**
 * Wrap a tool handler to enforce scope, rate limit, audit logging, and the
 * standard error envelope. Read-tools and write-tools both go through this.
 */
export function makeTool<TArgs extends Record<string, unknown>, TData>(
	opts: MakeToolOptions<TArgs, TData>,
): (
	env: McpToolsEnv,
	args: TArgs & ToolArgsWithActorToken,
) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
	return async (env, args) => {
		const startedAt = Date.now();
		const { actorToken, toolArgs } = stripActorToken(args);

		let ctx: McpToolContext;
		try {
			ctx = await resolveToolContext(env, env.__mcp, actorToken);
		} catch (e) {
			if (e instanceof McpDelegationError) {
				return toolReply(opts.name, err(opts.name, e.code, e.message));
			}
			throw e;
		}

		try {
			requireScope(ctx, opts.scopes);
		} catch (e) {
			if (e instanceof McpScopeError) {
				return toolReply(
					opts.name,
					err(opts.name, "insufficient_scope", e.message, {
						details: { required: e.required },
					}),
				);
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
				return toolReply(
					opts.name,
					rateLimited(opts.name, orgRl.retryAfter ?? 60),
				);
			}

			if (ctx.delegation) {
				const delegatedCategory =
					opts.rateLimitCategory === "mcp_write" ||
					opts.rateLimitCategory === "mcp_supply_sync"
						? "mcp_delegated_write"
						: "mcp_delegated_read";
				const delegatedRl = await checkRateLimit(
					env.RATION_KV,
					delegatedCategory,
					ctx.delegation.subjectUserId,
				);
				if (!delegatedRl.allowed) {
					if (opts.audit) {
						auditMcpWrite(ctx, {
							tool: opts.name,
							outcome: "error",
							errorCode: "rate_limited",
							durationMs: Date.now() - startedAt,
						});
					}
					return toolReply(
						opts.name,
						rateLimited(opts.name, delegatedRl.retryAfter ?? 60),
					);
				}
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
					return toolReply(
						opts.name,
						rateLimited(opts.name, keyRl.retryAfter ?? 60),
					);
				}
			}
		}

		try {
			const envelope = await opts.handler(ctx, toolArgs as TArgs);
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
			if (opts.audit || ctx.delegation) {
				auditMcpWrite(ctx, {
					tool: opts.name,
					outcome: envelope.ok ? "ok" : "error",
					errorCode: envelope.ok ? undefined : envelope.error.code,
					durationMs: Date.now() - startedAt,
				});
			}
			return toolReply(opts.name, envelope);
		} catch (e) {
			const origin =
				(env.BETTER_AUTH_URL ?? "").replace(/\/$/, "") || undefined;
			const envelope = mapErrorToEnvelope(opts.name, e, {
				preClaim: ctx.preClaim,
				origin,
			});
			if (opts.audit || ctx.delegation) {
				auditMcpWrite(ctx, {
					tool: opts.name,
					outcome: "error",
					errorCode: envelope.ok ? undefined : envelope.error.code,
					durationMs: Date.now() - startedAt,
				});
			}
			return toolReply(opts.name, envelope);
		}
	};
}

/** Register an MCP tool schema extended with optional Fin `actor_token`. */
export function registerMcpTool(
	server: McpServer,
	name: string,
	description: string,
	// biome-ignore lint/suspicious/noExplicitAny: MCP SDK tool schema is a string-keyed Zod map
	schema: Record<string, any>,
	// biome-ignore lint/suspicious/noExplicitAny: handler arity matches SDK
	handler: any,
): void {
	server.tool(
		name,
		description,
		{
			...schema,
			actor_token: z.string().optional(),
		},
		handler,
	);
}
