import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUserSettings, patchUserSettings } from "../../auth.server";
import { err, ok } from "../envelope";
import { type McpToolsEnv, makeTool, registerMcpTool } from "../tool-runtime";

export function registerPreferencesTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	registerMcpTool(
		server,
		"get_user_preferences",
		"Return the calling user's allergens, expirationAlertDays, theme, manifest defaults, and other settings stored in user.settings.",
		{},
		async () =>
			makeTool({
				name: "get_user_preferences",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx) => {
					const settings = await getUserSettings(env.DB, ctx.userId);
					return ok("get_user_preferences", settings);
				},
			})(env, {}),
	);

	registerMcpTool(
		server,
		"update_user_preferences",
		"Patch the calling user's settings (allergens, expirationAlertDays, theme, manifestSettings). Only provided fields are updated.",
		{
			allergens: z.array(z.string()).optional(),
			expirationAlertDays: z.number().int().min(0).max(365).optional(),
			theme: z.enum(["light", "dark"]).optional(),
		},
		async (args: {
			allergens?: string[];
			expirationAlertDays?: number;
			theme?: "light" | "dark";
		}) =>
			makeTool({
				name: "update_user_preferences",
				scopes: ["mcp:preferences:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					// We trust types but cast allergens for compatibility with AllergenSlug.
					const patch: Record<string, unknown> = {};
					if (a.allergens !== undefined) patch.allergens = a.allergens;
					if (a.expirationAlertDays !== undefined)
						patch.expirationAlertDays = a.expirationAlertDays;
					if (a.theme !== undefined) patch.theme = a.theme;
					if (Object.keys(patch).length === 0) {
						return err(
							"update_user_preferences",
							"invalid_input",
							"Provide at least one of: allergens, expirationAlertDays, theme.",
						);
					}
					await patchUserSettings(env.DB, ctx.userId, patch as never);
					const settings = await getUserSettings(env.DB, ctx.userId);
					return ok("update_user_preferences", settings);
				},
			})(env, args),
	);
}
