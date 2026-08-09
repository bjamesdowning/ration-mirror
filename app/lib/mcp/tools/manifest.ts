import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { mealPlanEntry } from "../../../db/schema";
import { getExpiringCargo } from "../../cargo.server";
import { addUtcDays, getUtcTodayISO } from "../../cargo-utils";
import { manifestConsumeNote } from "../../cook-feedback";
import { isFeatureEnabled } from "../../feature-flags/flags.server";
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
import { cookManifestEntries } from "../../manifest-cook.server";
import { MEAL_MATCH_CANDIDATE_CAP, matchMeals } from "../../matching.server";
import { createSupplyListFromSelectedMeals } from "../../supply.server";
import {
	resolveAgentFlagContext,
	resolveAgentSurface,
} from "../agent-flag-context";
import { err, featureDisabled, ok } from "../envelope";
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
				const today = getUtcTodayISO(now);
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
					const date = addUtcDays(today, d);
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
			name: "cook_manifest_entries",
			description:
				"Cook (prepare) Manifest entries: deduct Cargo once and mark Prepared. Never logs personal intake. Requires nutrition-cook-log-split. Soft-fails with requiresConfirmation when cargo is short — retry with confirmInsufficient:true after user confirms.",
			inputSchema: z.object({
				entryIds: z.array(z.string().uuid()).min(1).max(50),
				confirmInsufficient: z.boolean().optional(),
			}),
			scopes: ["mcp:manifest:write", "mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: (args) => args.confirmInsufficient === true,
			handler: async (ctx, a) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				const splitOn = await isFeatureEnabled(
					env,
					"nutrition-cook-log-split",
					flagContext,
				);
				if (!splitOn) {
					return featureDisabled(
						"cook_manifest_entries",
						"Manifest Cook is unavailable while nutrition-cook-log-split is off.",
						"Enable nutrition-cook-log-split, or use consume_manifest_entries for legacy combined consume when split is off.",
					);
				}
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const surface = resolveAgentSurface(ctx);
				const result = await cookManifestEntries(
					env,
					ctx.organizationId,
					plan.id,
					a.entryIds,
					{
						confirmInsufficient: a.confirmInsufficient,
						userId: ctx.userId,
						source: surface,
					},
				);
				if (result.requiresConfirmation) {
					return ok("cook_manifest_entries", {
						cooked: 0,
						requiresConfirmation: true,
						missingIngredients: result.missingIngredients,
						note: "Insufficient cargo. Retry with confirmInsufficient: true to cook and deduct what's available.",
					});
				}
				return ok("cook_manifest_entries", {
					cooked: result.cooked,
					requiresConfirmation: false,
					missingIngredients: undefined,
					entryIds: result.entryIds,
					alreadyCookedIds: result.alreadyCookedIds,
					deductions: result.deductions,
					partialCook: result.partialCook ?? false,
					skippedIngredients: result.skippedIngredients,
					offerPersonalLog: await isFeatureEnabled(
						env,
						"nutrition-manifest",
						flagContext,
					),
					note: manifestConsumeNote({
						consumed: result.cooked,
						partialCook: result.partialCook,
						skippedIngredients: result.skippedIngredients,
						deductionCount: result.deductions.length,
					}),
				});
			},
		}),
		defineSharedTool({
			name: "consume_manifest_entries",
			description:
				"Legacy: mark Manifest entries consumed and deduct Cargo. When nutrition-cook-log-split is on, this tool is refused — use cook_manifest_entries then log_manifest_intake. When split is off, optional logNutrition (default false for agents) may log intake if nutrition-manifest is on.",
			inputSchema: z.object({
				entryIds: z.array(z.string().uuid()).min(1).max(50),
				confirmInsufficient: z.boolean().optional(),
				portions: z
					.array(
						z.object({
							entryId: z.string().uuid(),
							servings: z.number().positive().max(100),
						}),
					)
					.max(50)
					.optional()
					.describe(
						"Plate-up portions per entry when logging intake on the legacy path.",
					),
				logNutrition: z
					.boolean()
					.optional()
					.describe(
						"When nutrition-manifest is on and cook-log-split is off, defaults to false for agents. Set true to log intake.",
					),
			}),
			scopes: ["mcp:manifest:write", "mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: (args) => args.confirmInsufficient === true,
			handler: async (ctx, a) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				const splitOn = await isFeatureEnabled(
					env,
					"nutrition-cook-log-split",
					flagContext,
				);
				if (splitOn) {
					return err(
						"consume_manifest_entries",
						"cook_eat_split_required",
						"nutrition-cook-log-split is on: use cook_manifest_entries for Cook, then log_manifest_intake for Eat.",
						{
							recoveryHint:
								"Call cook_manifest_entries with the entryIds, then log_manifest_intake with portions[{entryId, servings, idempotencyKey}]. Nutrition consent must already be active in Ration.",
						},
					);
				}
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const surface = resolveAgentSurface(ctx);
				const result = await consumeManifestEntries(
					env,
					ctx.organizationId,
					plan.id,
					a.entryIds,
					{
						confirmInsufficient: a.confirmInsufficient,
						userId: ctx.userId,
						source: surface,
						logNutrition: a.logNutrition,
						portions: a.portions,
						flagContext,
					},
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
