import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cookMealWithConfirmation } from "../../cook-confirmation.server";
import { cookDeductionNote } from "../../cook-feedback";
import {
	clearMealSelections,
	upsertMealSelection,
	validateMealOwnership,
} from "../../meal-selection.server";
import { createMeal, deleteMeal, updateMeal } from "../../meals.server";
import { McpCreateMealSchema, McpUpdateMealSchema } from "../../schemas/meal";
import { err, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

export function createGalleyToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "create_meal",
			description:
				"Create a structured recipe in the Galley (credit-free). For billed AI generation, disclose ration://galley/generate and use start_generate_meal after approval.",
			inputSchema: z.object({
				meal: McpCreateMealSchema,
			}),
			scopes: ["mcp:galley:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const parsed = McpCreateMealSchema.parse(a.meal);
				const created = await createMeal(
					env.DB,
					ctx.organizationId,
					parsed,
					env,
				);
				return ok("create_meal", {
					id: created?.id,
					name: created?.name,
					servings: created?.servings,
					ingredientCount: created?.ingredients.length ?? 0,
					tags: created?.tags ?? [],
				});
			},
		}),
		defineSharedTool({
			name: "update_meal",
			description:
				"Update a recipe in the Galley. Round-trip: list_meals → modify → pass complete object including id.",
			inputSchema: z.object({
				meal: McpUpdateMealSchema,
			}),
			scopes: ["mcp:galley:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const parsed = McpUpdateMealSchema.parse(a.meal);
				const { id, ...mealInput } = parsed;
				const updated = await updateMeal(
					env.DB,
					ctx.organizationId,
					id,
					mealInput,
				);
				if (!updated) {
					return err("update_meal", "not_found", "Meal not found.");
				}
				return ok("update_meal", {
					id: updated.id,
					name: updated.name,
					domain: updated.domain,
					description: updated.description,
					servings: updated.servings,
					ingredients: updated.ingredients.map((i) => ({
						ingredientName: i.ingredientName,
						quantity: i.quantity,
						unit: i.unit,
					})),
					tags: updated.tags,
				});
			},
		}),
		defineSharedTool({
			name: "delete_meal",
			description:
				"Delete a recipe from the Galley. Destructive — pass confirm:true. Cascades to ingredients/tags but does not delete plan entries.",
			inputSchema: z.object({
				mealId: z.string().uuid(),
				confirm: z.boolean(),
			}),
			scopes: ["mcp:galley:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
				if (!a.confirm) {
					return err(
						"delete_meal",
						"invalid_input",
						"Pass confirm:true to permanently delete this meal.",
					);
				}
				await deleteMeal(env.DB, ctx.organizationId, a.mealId);
				return ok("delete_meal", { deleted: true, mealId: a.mealId });
			},
		}),
		defineSharedTool({
			name: "set_active_meals",
			description:
				"Purpose-built: set the Galley active meal selection to exactly these mealIds (clears others). Optionally sync supply afterward.",
			inputSchema: z.object({
				mealIds: z.array(z.string().uuid()).max(50),
				syncSupply: z.boolean().optional().default(false),
			}),
			scopes: ["mcp:galley:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: (args) => args.syncSupply === true,
			handler: async (ctx, a) => {
				for (const mealId of a.mealIds) {
					const owns = await validateMealOwnership(
						env.DB,
						ctx.organizationId,
						mealId,
					);
					if (!owns) {
						return err(
							"set_active_meals",
							"not_found",
							`Meal ${mealId} not found.`,
						);
					}
				}
				await clearMealSelections(env.DB, ctx.organizationId);
				for (const mealId of a.mealIds) {
					await upsertMealSelection(env.DB, ctx.organizationId, mealId, null);
				}
				let supplySynced = false;
				if (a.syncSupply) {
					const { createSupplyListFromSelectedMeals } = await import(
						"../../supply.server"
					);
					await createSupplyListFromSelectedMeals(
						env,
						ctx.organizationId,
						undefined,
						{
							trigger: "mcp_sync_supply",
							organizationId: ctx.organizationId,
						},
						"metric",
						ctx.userId,
					);
					supplySynced = true;
				}
				return ok("set_active_meals", {
					activeCount: a.mealIds.length,
					mealIds: a.mealIds,
					supplySynced,
				});
			},
		}),
		defineSharedTool({
			name: "clear_active_meals",
			description:
				"Clear all active meal selections in the Galley. Destructive — pass confirm:true.",
			inputSchema: z.object({ confirm: z.boolean() }),
			scopes: ["mcp:galley:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
				if (!a.confirm) {
					return err(
						"clear_active_meals",
						"invalid_input",
						"Pass confirm:true to clear all active meal selections.",
					);
				}
				const result = await clearMealSelections(env.DB, ctx.organizationId);
				return ok("clear_active_meals", result);
			},
		}),
		defineSharedTool({
			name: "consume_meal",
			description:
				"Mark a meal as cooked and deduct ingredients from the pantry. Use after the user reports cooking/eating a meal.",
			inputSchema: z.object({
				mealId: z.string().uuid(),
				servings: z.number().int().positive().optional(),
				confirmInsufficient: z.boolean().optional(),
			}),
			scopes: ["mcp:galley:write", "mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: (args) => args.confirmInsufficient === true,
			handler: async (ctx, a) => {
				const result = await cookMealWithConfirmation(
					env,
					ctx.organizationId,
					a.mealId,
					{
						servings: a.servings,
						confirmInsufficient: a.confirmInsufficient,
					},
				);
				if (result.requiresConfirmation) {
					return ok("consume_meal", {
						consumed: false,
						requiresConfirmation: true,
						missingIngredients: result.missingIngredients,
						mealId: a.mealId,
						note: "Insufficient cargo. Retry with confirmInsufficient: true to cook and deduct what's available.",
					});
				}
				return ok("consume_meal", {
					consumed: true,
					requiresConfirmation: false,
					missingIngredients: undefined,
					mealId: a.mealId,
					servings: result.servings ?? a.servings ?? "default",
					deductions: result.deductions,
					partialCook: result.partialCook ?? false,
					skippedIngredients: result.skippedIngredients,
					note: cookDeductionNote({
						partialCook: result.partialCook,
						skippedIngredients: result.skippedIngredients,
						deductionCount: result.deductions.length,
					}),
				});
			},
		}),
	];
}

export function registerGalleyTools(server: McpServer, env: McpToolsEnv): void {
	for (const definition of createGalleyToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
