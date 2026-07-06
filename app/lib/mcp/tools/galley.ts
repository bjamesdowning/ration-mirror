import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { activeMealSelection } from "../../../db/schema";
import { cookMealWithConfirmation } from "../../cook-confirmation.server";
import { cookDeductionNote } from "../../cook-feedback";
import {
	clearMealSelections,
	getActiveMealSelections,
	upsertMealSelection,
	validateMealOwnership,
} from "../../meal-selection.server";
import { createMeal, deleteMeal, updateMeal } from "../../meals.server";
import { McpCreateMealSchema, McpUpdateMealSchema } from "../../schemas/meal";
import { err, ok } from "../envelope";
import { type McpToolsEnv, makeTool, registerMcpTool } from "../tool-runtime";

export function registerGalleyTools(server: McpServer, env: McpToolsEnv): void {
	registerMcpTool(
		server,
		"create_meal",
		"Create a new recipe in the Galley. For bulk import use REST POST /api/v1/galley/import (galley scope). AI generation stays in the Ration UI.",
		{
			meal: McpCreateMealSchema,
		},
		async (args: { meal: z.infer<typeof McpCreateMealSchema> }) =>
			makeTool({
				name: "create_meal",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
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
			})(env, args),
	);

	registerMcpTool(
		server,
		"update_meal",
		"Update a recipe in the Galley. Round-trip: list_meals → modify → pass complete object including id.",
		{
			meal: McpUpdateMealSchema,
		},
		async (args: { meal: z.infer<typeof McpUpdateMealSchema> }) =>
			makeTool({
				name: "update_meal",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
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
			})(env, args),
	);

	registerMcpTool(
		server,
		"delete_meal",
		"Delete a recipe from the Galley. Destructive — pass confirm:true. Cascades to ingredients/tags but does not delete plan entries.",
		{
			mealId: z.string().uuid(),
			confirm: z.boolean(),
		},
		async (args: { mealId: string; confirm: boolean }) =>
			makeTool({
				name: "delete_meal",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
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
			})(env, args),
	);

	registerMcpTool(
		server,
		"toggle_meal_active",
		"Toggle a meal's selection in the Galley active list. The active list drives sync_supply_from_selected_meals. Pass servingsOverride to set/clear the per-selection servings count.",
		{
			mealId: z.string().uuid(),
			active: z.boolean(),
			servingsOverride: z.number().int().positive().nullable().optional(),
		},
		async (args: {
			mealId: string;
			active: boolean;
			servingsOverride?: number | null;
		}) =>
			makeTool({
				name: "toggle_meal_active",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const owns = await validateMealOwnership(
						env.DB,
						ctx.organizationId,
						a.mealId,
					);
					if (!owns) {
						return err(
							"toggle_meal_active",
							"not_found",
							`Meal ${a.mealId} not found.`,
						);
					}
					if (a.active) {
						const result = await upsertMealSelection(
							env.DB,
							ctx.organizationId,
							a.mealId,
							a.servingsOverride ?? null,
						);
						return ok("toggle_meal_active", {
							mealId: a.mealId,
							isActive: result.isActive,
							servingsOverride: result.servingsOverride,
						});
					}
					// Clear by toggling: read current, delete if exists.
					const selections = await getActiveMealSelections(
						env.DB,
						ctx.organizationId,
					);
					const existing = selections.find((s) => s.mealId === a.mealId);
					if (!existing) {
						return ok("toggle_meal_active", {
							mealId: a.mealId,
							isActive: false,
						});
					}
					const d1 = drizzle(env.DB);
					await d1
						.delete(activeMealSelection)
						.where(eq(activeMealSelection.id, existing.id));
					return ok("toggle_meal_active", {
						mealId: a.mealId,
						isActive: false,
					});
				},
			})(env, args),
	);

	registerMcpTool(
		server,
		"clear_active_meals",
		"Clear all active meal selections in the Galley. Destructive — pass confirm:true.",
		{ confirm: z.boolean() },
		async (args: { confirm: boolean }) =>
			makeTool({
				name: "clear_active_meals",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
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
			})(env, args),
	);

	registerMcpTool(
		server,
		"consume_meal",
		"Mark a meal as cooked and deduct ingredients from the pantry. Use after the user reports cooking/eating a meal.",
		{
			mealId: z.string().uuid(),
			servings: z.number().int().positive().optional(),
			confirmInsufficient: z.boolean().optional(),
		},
		async (args: {
			mealId: string;
			servings?: number;
			confirmInsufficient?: boolean;
		}) =>
			makeTool({
				name: "consume_meal",
				scopes: ["mcp:galley:write", "mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
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
			})(env, args),
	);
}
