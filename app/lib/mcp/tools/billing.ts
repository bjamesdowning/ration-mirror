import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBillingAccountSummary } from "~/lib/billing.server";
import { log } from "~/lib/logging.server";
import { err, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

export function createBillingToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "get_billing_summary",
			description:
				"Return the caller's live billing and account snapshot: subscription tier, renewal/end date, credit balance, org role, subscription store, and links for pricing or managing billing. Call when the user asks about subscription, credits, renewal, cancellation, billing portal, or account limits.",
			inputSchema: z.object({}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx) => {
				try {
					const summary = await getBillingAccountSummary(env, {
						userId: ctx.userId,
						organizationId: ctx.organizationId,
					});
					return ok("get_billing_summary", summary);
				} catch (error) {
					log.error("[get_billing_summary] failed", error);
					return err(
						"get_billing_summary",
						"internal_error",
						"Unable to load billing summary.",
					);
				}
			},
		}),
	];
}

export function registerBillingTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	for (const definition of createBillingToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
