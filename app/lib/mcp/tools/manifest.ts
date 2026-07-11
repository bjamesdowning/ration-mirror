import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { mealPlanEntry } from "../../../db/schema";
import { manifestConsumeNote } from "../../cook-feedback";
import {
	addEntry,
	consumeManifestEntries,
	deleteEntry,
	ensureMealPlan,
	updateEntry,
} from "../../manifest.server";
import {
	insertManifestBulkEntries,
	ManifestBulkSubmissionError,
} from "../../manifest-bulk-submit.server";
import { err, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

export function createManifestToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "add_meal_plan_entry",
			description:
				"Add a meal to the weekly meal plan for a specific date and slot.",
			inputSchema: z.object({
				mealId: z.string().uuid(),
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
				servingsOverride: z.number().int().positive().optional(),
				notes: z.string().max(500).optional(),
			}),
			scopes: ["mcp:manifest:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const entry = await addEntry(env.DB, ctx.organizationId, plan.id, {
					mealId: a.mealId,
					date: a.date,
					slotType: a.slotType,
					servingsOverride: a.servingsOverride ?? null,
					notes: a.notes ?? null,
				});
				return ok("add_meal_plan_entry", {
					entryId: entry.id,
					mealName: entry.mealName,
					date: entry.date,
					slotType: entry.slotType,
					servings: entry.servingsOverride ?? entry.mealServings,
				});
			},
		}),
		defineSharedTool({
			name: "bulk_add_meal_plan_entries",
			description:
				"Add multiple meal plan entries in one call (max 50). All-or-nothing: validation runs first, then entries are batched.",
			inputSchema: z.object({
				entries: z
					.array(
						z.object({
							mealId: z.string().uuid(),
							date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
							slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
							servingsOverride: z
								.number()
								.int()
								.positive()
								.nullable()
								.optional(),
							notes: z.string().max(500).nullable().optional(),
						}),
					)
					.min(1)
					.max(50),
			}),
			scopes: ["mcp:manifest:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				try {
					const result = await insertManifestBulkEntries(
						env.DB,
						ctx.organizationId,
						plan.id,
						{
							entries: a.entries.map((entry) => ({
								...entry,
								orderIndex: 0,
							})),
						},
					);
					return ok("bulk_add_meal_plan_entries", {
						created: result.entries,
						errorCount: 0,
					});
				} catch (error) {
					if (error instanceof ManifestBulkSubmissionError) {
						return err(
							"bulk_add_meal_plan_entries",
							error.status === 404 ? "not_found" : "unauthorized",
							error.message,
						);
					}
					throw error;
				}
			},
		}),
		defineSharedTool({
			name: "update_meal_plan_entry",
			description:
				"Update an existing meal plan entry (date, slot, servings, notes). Cannot change consumed entries.",
			inputSchema: z.object({
				entryId: z.string().uuid(),
				date: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional(),
				slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
				servingsOverride: z.number().int().positive().optional(),
				clearServingsOverride: z.boolean().optional(),
				notes: z.string().max(500).optional(),
				orderIndex: z.number().int().nonnegative().optional(),
			}),
			scopes: ["mcp:manifest:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const hasPatch =
					a.date !== undefined ||
					a.slotType !== undefined ||
					a.servingsOverride !== undefined ||
					a.clearServingsOverride === true ||
					a.notes !== undefined ||
					a.orderIndex !== undefined;
				if (!hasPatch) {
					return err(
						"update_meal_plan_entry",
						"invalid_input",
						"Provide at least one of: date, slotType, servingsOverride, clearServingsOverride, notes, orderIndex.",
					);
				}
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const d1 = drizzle(env.DB);
				const [existing] = await d1
					.select({ consumedAt: mealPlanEntry.consumedAt })
					.from(mealPlanEntry)
					.where(
						and(
							eq(mealPlanEntry.id, a.entryId),
							eq(mealPlanEntry.planId, plan.id),
						),
					)
					.limit(1);
				if (!existing) {
					return err(
						"update_meal_plan_entry",
						"not_found",
						"Entry not found on your active meal plan.",
					);
				}
				if (existing.consumedAt != null) {
					return err(
						"update_meal_plan_entry",
						"conflict",
						"This entry is already marked consumed; remove it or edit unconsumed entries only.",
					);
				}
				const input: {
					date?: string;
					slotType?: string;
					orderIndex?: number;
					servingsOverride?: number | null;
					notes?: string | null;
				} = {};
				if (a.date !== undefined) input.date = a.date;
				if (a.slotType !== undefined) input.slotType = a.slotType;
				if (a.orderIndex !== undefined) input.orderIndex = a.orderIndex;
				if (a.clearServingsOverride === true) {
					input.servingsOverride = null;
				} else if (a.servingsOverride !== undefined) {
					input.servingsOverride = a.servingsOverride;
				}
				if (a.notes !== undefined) input.notes = a.notes;
				const updated = await updateEntry(
					env.DB,
					ctx.organizationId,
					plan.id,
					a.entryId,
					input,
				);
				if (!updated) {
					return err(
						"update_meal_plan_entry",
						"internal_error",
						"Update failed.",
					);
				}
				return ok("update_meal_plan_entry", {
					entryId: updated.id,
					date: updated.date,
					slotType: updated.slotType,
					mealName: updated.mealName,
					servings: updated.servingsOverride ?? updated.mealServings,
					notes: updated.notes,
					orderIndex: updated.orderIndex,
				});
			},
		}),
		defineSharedTool({
			name: "consume_manifest_entries",
			description:
				"Mark manifest entries as consumed. Deducts ingredients when available; returns requiresConfirmation when cargo is short.",
			inputSchema: z.object({
				entryIds: z.array(z.string().uuid()).min(1).max(50),
				confirmInsufficient: z.boolean().optional(),
			}),
			scopes: ["mcp:manifest:write", "mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: (args) => args.confirmInsufficient === true,
			handler: async (ctx, a) => {
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const result = await consumeManifestEntries(
					env,
					ctx.organizationId,
					plan.id,
					a.entryIds,
					{ confirmInsufficient: a.confirmInsufficient },
				);
				if (result.requiresConfirmation) {
					return ok("consume_manifest_entries", {
						consumed: 0,
						requiresConfirmation: true,
						missingIngredients: result.missingIngredients,
						note: "Insufficient cargo. Retry with confirmInsufficient: true to mark eaten and deduct what's available.",
					});
				}
				return ok("consume_manifest_entries", {
					consumed: result.consumed,
					requiresConfirmation: false,
					missingIngredients: undefined,
					entryIds: result.entryIds,
					deductions: result.deductions,
					partialCook: result.partialCook ?? false,
					skippedIngredients: result.skippedIngredients,
					note: manifestConsumeNote({
						consumed: result.consumed,
						partialCook: result.partialCook,
						skippedIngredients: result.skippedIngredients,
						deductionCount: result.deductions.length,
					}),
				});
			},
		}),
		defineSharedTool({
			name: "remove_meal_plan_entry",
			description: "Remove a meal from the weekly plan.",
			inputSchema: z.object({ entryId: z.string().uuid() }),
			scopes: ["mcp:manifest:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const removed = await deleteEntry(
					env.DB,
					ctx.organizationId,
					plan.id,
					a.entryId,
				);
				if (!removed) {
					return err(
						"remove_meal_plan_entry",
						"not_found",
						"Entry not found on your active meal plan.",
					);
				}
				return ok("remove_meal_plan_entry", {
					removed: true,
					entryId: a.entryId,
				});
			},
		}),
	];
}

export function registerManifestTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	for (const definition of createManifestToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
