import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isNutritionHealthExportEnabled } from "../../nutrition/fast-log-flag.server";
import {
	clearHealthExport,
	getHealthExportPending,
	getHealthExportStatus,
	setHealthExportPreference,
} from "../../nutrition/health-export.server";
import {
	resolveAgentFlagContext,
	resolveAgentSurface,
} from "../agent-flag-context";
import type { McpToolContext } from "../auth";
import { err, featureDisabled, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

const disabled = (tool: string) =>
	featureDisabled(
		tool,
		"Apple Health export is unavailable.",
		"Enable nutrition-health-export. The parent nutrition-fast-log must also be on. iOS below 1.6.0 stays disabled. This does not depend on a plan.",
	);

function principal(ctx: McpToolContext) {
	return {
		userId: ctx.userId,
		organizationId: ctx.organizationId,
		surface: resolveAgentSurface(ctx),
		authMethod: ctx.authMethod,
		credentialId: ctx.apiKeyId || null,
		clientId: ctx.oauthClientId ?? null,
		scopes: [
			...(ctx.scopes.includes("mcp:nutrition:read") ? ["nutrition:read"] : []),
			...(ctx.scopes.includes("mcp:nutrition:write")
				? ["nutrition:write"]
				: []),
		],
		requestId: crypto.randomUUID(),
	};
}

export function createHealthExportToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "get_health_export_status",
			description:
				"Read the Apple Health export switch. Status is off, needs_device_permission, denied, or on. The phone writes HealthKit. This read has no plan check and does not return crew_required or upgrade_required. Requires nutrition-health-export and nutrition-fast-log. iOS below 1.6.0 stays disabled.",
			inputSchema: z.object({}),
			scopes: ["mcp:nutrition:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			readOnlyHint: true,
			handler: async (ctx) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionHealthExportEnabled(env, flagContext))) {
					return disabled("get_health_export_status");
				}
				const result = await getHealthExportStatus(
					env,
					principal(ctx),
					flagContext,
				);
				return ok("get_health_export_status", result, {
					outcome: "no_effect",
				});
			},
		}),
		defineSharedTool({
			name: "get_health_export_preview",
			description:
				"Preview confirmed eaten foods the signed-in person could export. One sample per nutrient per food. No daily total. An ai_estimate is not exported. Does not write HealthKit. Requires intake consent. No plan check.",
			inputSchema: z.object({
				cursor: z
					.object({
						written: z
							.record(z.string(), z.number().int().nonnegative())
							.optional(),
						deleted: z.array(z.string()).optional(),
					})
					.optional(),
			}),
			scopes: ["mcp:nutrition:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			readOnlyHint: true,
			handler: async (ctx, args) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionHealthExportEnabled(env, flagContext))) {
					return disabled("get_health_export_preview");
				}
				const result = await getHealthExportPending(
					env,
					principal(ctx),
					flagContext,
					{
						cursor: {
							written: args.cursor?.written ?? {},
							deleted: args.cursor?.deleted ?? [],
						},
					},
				);
				return ok("get_health_export_preview", result, {
					outcome: "no_effect",
				});
			},
		}),
		defineSharedTool({
			name: "set_health_export",
			description:
				"Turn the Apple Health export preference on or off for the signed-in person. Pass confirm:true. The phone writes HealthKit after the system permission sheet. This tool does not write HealthKit and does not check a plan. Turning it off does not delete samples. Requires nutrition-health-export.",
			inputSchema: z.object({
				enabled: z.boolean(),
				deviceStatus: z
					.enum(["off", "needs_device_permission", "denied", "on"])
					.optional(),
				confirm: z.boolean(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				if (!args.confirm) {
					return err(
						"set_health_export",
						"invalid_input",
						"Pass confirm:true to change Apple Health export.",
					);
				}
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionHealthExportEnabled(env, flagContext))) {
					return disabled("set_health_export");
				}
				const result = await setHealthExportPreference(
					env,
					principal(ctx),
					flagContext,
					args,
				);
				return ok("set_health_export", result, { outcome: "committed" });
			},
		}),
		defineSharedTool({
			name: "clear_health_export",
			description:
				"Ask the device to delete dietary samples this app wrote for the signed-in person. Pass confirm:true. Does not delete samples from another app. Does not write HealthKit. Turning the switch off is separate and does not delete samples by itself.",
			inputSchema: z.object({ confirm: z.boolean() }),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			destructiveHint: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				if (!args.confirm) {
					return err(
						"clear_health_export",
						"invalid_input",
						"Pass confirm:true to ask the device to delete Ration's samples.",
					);
				}
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionHealthExportEnabled(env, flagContext))) {
					return disabled("clear_health_export");
				}
				const result = await clearHealthExport(
					env,
					principal(ctx),
					flagContext,
					args,
				);
				return ok("clear_health_export", result, { outcome: "committed" });
			},
		}),
	];
}

export async function registerHealthExportTools(
	server: McpServer,
	env: McpToolsEnv,
): Promise<void> {
	const flagContext = resolveAgentFlagContext(env, env.__mcp);
	if (!(await isNutritionHealthExportEnabled(env, flagContext))) return;
	for (const definition of createHealthExportToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
