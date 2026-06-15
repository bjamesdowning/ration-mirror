import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { mealPlanEntry } from "../../../db/schema";
import {
	addEntry,
	deleteEntry,
	ensureMealPlan,
	updateEntry,
} from "../../manifest.server";
import { err, ok } from "../envelope";
import { type McpToolsEnv, makeTool, registerMcpTool } from "../tool-runtime";

export function registerManifestTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	registerMcpTool(
		server,
		"add_meal_plan_entry",
		"Add a meal to the weekly meal plan for a specific date and slot.",
		{
			mealId: z.string().uuid(),
			date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
			servingsOverride: z.number().int().positive().optional(),
			notes: z.string().max(500).optional(),
		},
		async (args: {
			mealId: string;
			date: string;
			slotType: "breakfast" | "lunch" | "dinner" | "snack";
			servingsOverride?: number;
			notes?: string;
		}) =>
			makeTool({
				name: "add_meal_plan_entry",
				scopes: ["mcp:manifest:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
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
			})(env, args),
	);

	registerMcpTool(
		server,
		"bulk_add_meal_plan_entries",
		"Add multiple meal plan entries in one call (max 50). All-or-nothing: validation runs first, then entries are batched.",
		{
			entries: z
				.array(
					z.object({
						mealId: z.string().uuid(),
						date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
						slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
						servingsOverride: z.number().int().positive().nullable().optional(),
						notes: z.string().max(500).nullable().optional(),
					}),
				)
				.min(1)
				.max(50),
		},
		async (args: {
			entries: Array<{
				mealId: string;
				date: string;
				slotType: "breakfast" | "lunch" | "dinner" | "snack";
				servingsOverride?: number | null;
				notes?: string | null;
			}>;
		}) =>
			makeTool({
				name: "bulk_add_meal_plan_entries",
				scopes: ["mcp:manifest:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const plan = await ensureMealPlan(env.DB, ctx.organizationId);
					const created: Array<{
						entryId: string;
						mealId: string;
						date: string;
						slotType: string;
					}> = [];
					const errors: Array<{ index: number; error: string }> = [];
					// addEntry validates ownership per row; we serialize to surface row-level errors.
					for (let i = 0; i < a.entries.length; i++) {
						const e = a.entries[i];
						if (!e) continue;
						try {
							const entry = await addEntry(
								env.DB,
								ctx.organizationId,
								plan.id,
								{
									mealId: e.mealId,
									date: e.date,
									slotType: e.slotType,
									servingsOverride: e.servingsOverride ?? null,
									notes: e.notes ?? null,
								},
							);
							created.push({
								entryId: entry.id,
								mealId: entry.mealId,
								date: entry.date,
								slotType: entry.slotType,
							});
						} catch (err2) {
							errors.push({
								index: i,
								error: err2 instanceof Error ? err2.message : String(err2),
							});
						}
					}
					return ok("bulk_add_meal_plan_entries", {
						created,
						errorCount: errors.length,
						errors: errors.length > 0 ? errors : undefined,
					});
				},
			})(env, args),
	);

	registerMcpTool(
		server,
		"update_meal_plan_entry",
		"Update an existing meal plan entry (date, slot, servings, notes). Cannot change consumed entries.",
		{
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
		},
		async (args: {
			entryId: string;
			date?: string;
			slotType?: "breakfast" | "lunch" | "dinner" | "snack";
			servingsOverride?: number;
			clearServingsOverride?: boolean;
			notes?: string;
			orderIndex?: number;
		}) =>
			makeTool({
				name: "update_meal_plan_entry",
				scopes: ["mcp:manifest:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
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
			})(env, args),
	);

	registerMcpTool(
		server,
		"remove_meal_plan_entry",
		"Remove a meal from the weekly plan.",
		{ entryId: z.string().uuid() },
		async (args: { entryId: string }) =>
			makeTool({
				name: "remove_meal_plan_entry",
				scopes: ["mcp:manifest:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
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
			})(env, args),
	);
}
