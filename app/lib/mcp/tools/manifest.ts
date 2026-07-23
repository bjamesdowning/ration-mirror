import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { mealPlanEntry } from "../../../db/schema";
import { getExpiringCargo } from "../../cargo.server";
import { manifestConsumeNote } from "../../cook-feedback";
import {
	addEntry,
	consumeManifestEntries,
	deleteEntry,
	ensureMealPlan,
	getTodayISO,
	updateEntry,
} from "../../manifest.server";
import {
	insertManifestBulkEntries,
	ManifestBulkSubmissionError,
} from "../../manifest-bulk-submit.server";
import { addDays } from "../../manifest-dates";
import { MEAL_MATCH_CANDIDATE_CAP, matchMeals } from "../../matching.server";
import { createSupplyListFromSelectedMeals } from "../../supply.server";
import { err, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

const planEntryInput = z.object({
	mealId: z.string().uuid(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
	servingsOverride: z.number().int().positive().nullable().optional(),
	notes: z.string().max(500).nullable().optional(),
});

export function createManifestToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "propose_manifest_plan",
			description:
				"Purpose-built read: build a compact week schedule from expiring pantry items + match_meals (delta). Returns a summary proposal — no writes. Follow with commit_manifest_plan after user confirmation.",
			inputSchema: z.object({
				daysAhead: z.number().int().min(1).max(14).optional().default(7),
				daysExpiring: z.number().int().min(1).max(14).optional().default(10),
				minMatch: z.number().min(0).max(100).optional().default(60),
				mealsPerDay: z.number().int().min(1).max(4).optional().default(1),
				slotType: z
					.enum(["breakfast", "lunch", "dinner", "snack"])
					.optional()
					.default("dinner"),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_search",
			audit: false,
			handler: async (ctx, a) => {
				const daysAhead = a.daysAhead ?? 7;
				const daysExpiring = a.daysExpiring ?? 10;
				const minMatch = a.minMatch ?? 60;
				const mealsPerDay = a.mealsPerDay ?? 1;
				const slotType = a.slotType ?? "dinner";
				const now = new Date();
				const expiring = await getExpiringCargo(
					env.DB,
					ctx.organizationId,
					daysExpiring,
					50,
					undefined,
					now,
				);
				const matches = await matchMeals(env, ctx.organizationId, {
					mode: "delta",
					minMatch,
					limit: Math.min(30, daysAhead * mealsPerDay + 5),
					preLimit: MEAL_MATCH_CANDIDATE_CAP,
				});
				const today = getTodayISO();
				const proposed: Array<{
					date: string;
					slotType: string;
					mealId: string;
					mealName: string;
					matchPercent: number;
					reason: string;
				}> = [];
				let mealIdx = 0;
				for (let d = 0; d < daysAhead && mealIdx < matches.length; d++) {
					const date = addDays(today, d);
					for (
						let s = 0;
						s < mealsPerDay && mealIdx < matches.length && proposed.length < 21;
						s++
					) {
						const m = matches[mealIdx++];
						proposed.push({
							date,
							slotType,
							mealId: m.meal.id,
							mealName: m.meal.name,
							matchPercent: Math.round(m.matchPercentage),
							reason:
								expiring.length > 0
									? "Matches pantry; prioritizes cookability near expiry window"
									: "Best cookability match from pantry",
						});
					}
				}
				return ok("propose_manifest_plan", {
					expiringCount: expiring.length,
					expiringSample: expiring.slice(0, 5).map((i) => ({
						id: i.id,
						name: i.name,
						expiresAt: i.expiresAt,
					})),
					proposed,
					notes:
						proposed.length === 0
							? "No matching meals found. Add recipes to Galley or lower minMatch."
							: `Proposed ${proposed.length} entries. Confirm with the user, then call commit_manifest_plan.`,
				});
			},
		}),
		defineSharedTool({
			name: "commit_manifest_plan",
			description:
				"Purpose-built write: commit a confirmed meal schedule (max 50) and optionally sync supply. Prefer this for week fills. Requires approval.",
			inputSchema: z.object({
				entries: z.array(planEntryInput).min(1).max(50),
				syncSupply: z.boolean().optional().default(false),
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
					let supplySynced = false;
					if (a.syncSupply) {
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
					return ok("commit_manifest_plan", {
						created: result.entries,
						errorCount: 0,
						supplySynced,
					});
				} catch (error) {
					if (error instanceof ManifestBulkSubmissionError) {
						return err(
							"commit_manifest_plan",
							error.status === 404 ? "not_found" : "unauthorized",
							error.message,
						);
					}
					throw error;
				}
			},
		}),
		defineSharedTool({
			name: "add_meal_plan_entry",
			description:
				"Add a meal to the weekly meal plan for a specific date and slot. For 2+ entries prefer commit_manifest_plan.",
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
