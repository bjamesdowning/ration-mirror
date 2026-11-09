import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isNutritionSavedFoodEnabled } from "../../nutrition/fast-log-flag.server";
import {
	deleteSavedFood,
	listSavedFoods,
	saveFood,
} from "../../nutrition/saved-food.server";
import { DiaryMacrosSchema } from "../../schemas/diary";
import { UuidSchema } from "../../schemas/uuid";
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

function reader(ctx: McpToolContext) {
	return {
		userId: ctx.userId,
		organizationId: ctx.organizationId,
		surface: resolveAgentSurface(ctx),
	};
}

export function createSavedFoodToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "list_saved_foods",
			description:
				"List the signed-in person's saved foods. Another household member's foods are not included. Read only. Requires nutrition-saved-food and its parent nutrition-fast-log. iOS below 1.6.0 stays disabled.",
			inputSchema: z.object({}),
			scopes: ["mcp:nutrition:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			readOnlyHint: true,
			handler: async (ctx) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionSavedFoodEnabled(env, flagContext))) {
					return featureDisabled(
						"list_saved_foods",
						"Saved foods are unavailable.",
						"Enable nutrition-saved-food. The parent nutrition-fast-log must also be on.",
					);
				}
				const savedFoods = await listSavedFoods(env.DB, ctx.userId);
				return ok("list_saved_foods", { savedFoods });
			},
		}),
		defineSharedTool({
			name: "save_food",
			description:
				"Save a starred recent or a custom food for this person only. Stores name, nutrients, and the default amount and unit. Does not write intake, Cargo, or another member's list. The same name updates this person's saved numbers and does not change past intake. Requires approval. Requires nutrition-saved-food and nutrition-fast-log. iOS below 1.6.0 stays disabled. Not medical advice.",
			inputSchema: z.object({
				name: z.string().trim().min(1).max(120),
				amount: z.number().finite().positive(),
				unit: z.enum(["serving", "g", "oz"]),
				energyKcal: z.number().finite().nonnegative(),
				proteinG: z.number().finite().nonnegative(),
				carbsG: z.number().finite().nonnegative(),
				fatG: z.number().finite().nonnegative(),
				fiberG: z.number().finite().nonnegative().nullable().optional(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionSavedFoodEnabled(env, flagContext))) {
					return featureDisabled(
						"save_food",
						"Saved foods are unavailable.",
						"Enable nutrition-saved-food. The parent nutrition-fast-log must also be on.",
					);
				}
				const macros = DiaryMacrosSchema.parse({
					energyKcal: args.energyKcal,
					proteinG: args.proteinG,
					carbsG: args.carbsG,
					fatG: args.fatG,
					fiberG: args.fiberG,
				});
				const saved = await saveFood(env.DB, reader(ctx).userId, {
					name: args.name,
					amount: args.amount,
					unit: args.unit,
					macros,
				});
				return ok("save_food", { savedFood: saved });
			},
		}),
		defineSharedTool({
			name: "delete_saved_food",
			description:
				"Delete one of the caller's saved foods. Does not void past intake. Those rows keep the copied name and nutrients, and the saved-food link is cleared. Pass confirm:true. Requires approval. Refuses without confirm and writes nothing. Requires nutrition-saved-food and nutrition-fast-log. iOS below 1.6.0 stays disabled.",
			inputSchema: z.object({
				savedFoodId: UuidSchema,
				confirm: z.boolean(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				if (args.confirm !== true) {
					return err(
						"delete_saved_food",
						"invalid_input",
						"Pass confirm:true to delete a saved food. Nothing was deleted.",
					);
				}
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionSavedFoodEnabled(env, flagContext))) {
					return featureDisabled(
						"delete_saved_food",
						"Saved foods are unavailable.",
						"Enable nutrition-saved-food. The parent nutrition-fast-log must also be on.",
					);
				}
				const result = await deleteSavedFood(
					env.DB,
					ctx.userId,
					args.savedFoodId,
				);
				return ok("delete_saved_food", result);
			},
		}),
	];
}

export async function registerSavedFoodTools(
	server: McpServer,
	env: McpToolsEnv,
): Promise<void> {
	const flagContext = resolveAgentFlagContext(env, env.__mcp);
	if (!(await isNutritionSavedFoodEnabled(env, flagContext))) return;
	for (const definition of createSavedFoodToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
