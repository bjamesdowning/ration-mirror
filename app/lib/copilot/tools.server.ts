import { tool } from "ai";
import { z } from "zod";
import { log } from "../logging.server";
import type { McpToolContext } from "../mcp/auth";
import { err, ok } from "../mcp/envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	runTool,
	type SharedToolDefinition,
} from "../mcp/tool-runtime";
import { createAiWorkflowToolDefs } from "../mcp/tools/ai-workflows";
import { createBillingToolDefs } from "../mcp/tools/billing";
import { createGalleyToolDefs } from "../mcp/tools/galley";
import { createInventoryToolDefs } from "../mcp/tools/inventory";
import { createManifestToolDefs } from "../mcp/tools/manifest";
import { createPreferencesToolDefs } from "../mcp/tools/preferences";
import { createReadToolDefs } from "../mcp/tools/read";
import { createSupplyToolDefs } from "../mcp/tools/supply";

export type CopilotToolContext = Pick<
	McpToolContext,
	"organizationId" | "userId" | "scopes" | "preClaim" | "waitUntil"
>;

export function buildCopilotMcpContext(
	ctx: CopilotToolContext,
): McpToolContext {
	return {
		organizationId: ctx.organizationId,
		userId: ctx.userId,
		scopes: ctx.scopes,
		preClaim: ctx.preClaim,
		authMethod: "oauth",
		apiKeyId: `copilot:${ctx.userId}`,
		keyName: "Ration Copilot",
		keyPrefix: "copilot_",
		waitUntil: ctx.waitUntil,
	};
}

function envWithCopilotContext(
	env: Cloudflare.Env,
	ctx: CopilotToolContext,
): McpToolsEnv {
	return {
		...env,
		__mcp: buildCopilotMcpContext(ctx),
	} as McpToolsEnv;
}

export const COPILOT_MCP_SCOPES = [
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
] as const;

/**
 * AI Search instances the copilot queries. All copilot knowledge — product
 * docs (`docs/fin`), blog (`content/blog`), engineering (`docs/dev`, root
 * `README.md`), and legal (`docs/legal`) — is uploaded to the single
 * `ration-copilot-docs` R2 bucket backing the `ration-docs` instance, so one
 * instance covers everything. Add more entries here to fan out.
 */
const COPILOT_AI_SEARCH_INSTANCES = ["ration-docs"] as const;

async function searchAiSearchInstance(
	env: Cloudflare.Env,
	instanceName: string,
	query: string,
) {
	const binding = env.AI_SEARCH as
		| {
				search?: (request: unknown) => Promise<unknown>;
		  }
		| undefined;
	if (!binding?.search) {
		throw new Error("AI Search binding is not available");
	}
	return binding.search({
		messages: [{ role: "user", content: query }],
		ai_search_options: {
			instance_ids: [instanceName],
			retrieval_type: "hybrid",
			reranking: { enabled: true },
		},
	});
}

function createSearchDocsToolDef(env: Cloudflare.Env): SharedToolDefinition {
	return defineSharedTool({
		name: "search_docs",
		description:
			"Search official Ration docs: product how-tos (docs/fin), blog, engineering README/docs/dev, and legal. Use before answering questions about how the app works. Do not use for live pantry, meals, or shopping state — use inventory/read tools instead.",
		inputSchema: z.object({
			query: z.string().min(1),
		}),
		scopes: ["mcp:read"],
		rateLimitCategory: "mcp_search",
		audit: false,
		handler: async (_ctx, args) => {
			const settled = await Promise.allSettled(
				COPILOT_AI_SEARCH_INSTANCES.map(
					async (instance): Promise<{ instance: string; result: unknown }> => ({
						instance,
						result: await searchAiSearchInstance(env, instance, args.query),
					}),
				),
			);
			const results = settled
				.filter(
					(
						outcome,
					): outcome is PromiseFulfilledResult<{
						instance: string;
						result: unknown;
					}> => outcome.status === "fulfilled",
				)
				.map((outcome) => outcome.value);
			for (const outcome of settled) {
				if (outcome.status === "rejected") {
					log.error("[Copilot] search_docs instance failed", outcome.reason);
				}
			}
			if (results.length === 0) {
				return err(
					"search_docs",
					"internal_error",
					"Ration Copilot knowledge search is unavailable.",
					{
						recoveryHint:
							"Tell the user docs search is temporarily unavailable; answer from general Ration product knowledge cautiously or ask them to retry.",
					},
				);
			}
			return ok("search_docs", { query: args.query, results });
		},
	});
}

export function createCopilotToolDefs(
	env: McpToolsEnv,
): SharedToolDefinition[] {
	return [
		createSearchDocsToolDef(env),
		...createReadToolDefs(env),
		...createBillingToolDefs(env),
		...createInventoryToolDefs(env),
		...createGalleyToolDefs(env),
		...createManifestToolDefs(env),
		...createSupplyToolDefs(env),
		...createPreferencesToolDefs(env),
		...createAiWorkflowToolDefs(env),
	];
}

export function toAiSdkTools(
	env: Cloudflare.Env,
	ctx: CopilotToolContext,
	hooks?: {
		onApprovalRequested?: (toolName: string) => void;
		onApprovalResolved?: (toolName: string) => void;
	},
) {
	const toolEnv = envWithCopilotContext(env, ctx);
	const defs = createCopilotToolDefs(toolEnv);

	return Object.fromEntries(
		defs.map((def) => {
			const resolveNeedsApproval = (args: Record<string, unknown>): boolean => {
				const approval = def.needsApproval;
				if (approval == null) return false;
				if (typeof approval === "function") {
					return Boolean(
						(approval as (a: Record<string, unknown>) => unknown)(args),
					);
				}
				return Boolean(approval);
			};

			return [
				def.name,
				tool({
					description: def.description,
					inputSchema: def.inputSchema,
					needsApproval: (args: Record<string, unknown>) => {
						const needed = resolveNeedsApproval(args);
						if (needed) hooks?.onApprovalRequested?.(def.name);
						return needed;
					},
					execute: async (args) => {
						// Host Approve card is consent for Copilot — bind confirm on
						// tools that still require confirm:true in the shared handler.
						const patchedArgs =
							def.name === "remove_cargo_item" ||
							def.name === "delete_meal" ||
							def.name === "clear_active_meals" ||
							def.name === "complete_supply_list"
								? { ...args, confirm: true }
								: args;
						if (resolveNeedsApproval(args as Record<string, unknown>)) {
							hooks?.onApprovalResolved?.(def.name);
						}
						const envelope = await runTool(toolEnv, def, patchedArgs);
						// Return full MCP envelope so the model sees ok/warnings/meta
						// (including meta.replayed) consistently with external MCP clients.
						if (!envelope.ok) {
							return {
								ok: false as const,
								tool: envelope.tool,
								error: envelope.error,
							};
						}
						return {
							ok: true as const,
							tool: envelope.tool,
							data: envelope.data,
							...(envelope.warnings ? { warnings: envelope.warnings } : {}),
							...(envelope.meta ? { meta: envelope.meta } : {}),
						};
					},
				}),
			];
		}),
	);
}
