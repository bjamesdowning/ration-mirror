import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUtcTodayISO } from "../../cargo-utils";
import { isFeatureEnabled } from "../../feature-flags/flags.server";
import { ensureMealPlan } from "../../manifest.server";
import {
	clearManifestPersonalIntake,
	upsertManifestPersonalIntake,
} from "../../nutrition/intake-log.server";
import {
	clearNutritionGoal,
	getNutritionSummary,
	listNutritionIntakesForRange,
	upsertNutritionGoal,
} from "../../nutrition/persist.server";
import { resolveNutritionGoalConsentAt } from "../../nutrition/resolve-goal-consent.server";
import {
	NutritionGoalUpsertSchema,
	NutritionSummaryQuerySchema,
} from "../../schemas/nutrition";
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

function serializeGoal(
	row: NonNullable<Awaited<ReturnType<typeof upsertNutritionGoal>>>,
) {
	return {
		id: row.id,
		dailyEnergyKcal: row.dailyEnergyKcal,
		proteinG: row.proteinG,
		carbsG: row.carbsG,
		fatG: row.fatG,
		fiberG: row.fiberG,
		effectiveFrom: row.effectiveFrom,
		effectiveTo: row.effectiveTo,
		consentAt: row.consentAt,
		createdAt: row.createdAt,
	};
}

const intakePortionSchema = z.object({
	entryId: z.string().uuid(),
	servings: z.number().min(0.5).max(100),
	idempotencyKey: z.string().uuid(),
});

export function createNutritionToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "get_nutrition_summary",
			description:
				"Return daily nutrition intake totals (energy, macros, optional fiberG when known) for a UTC date range, plus the active goal when set. Requires nutrition-goals or nutrition-manifest. Not medical advice.",
			inputSchema: z.object({
				from: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.describe("Inclusive UTC start date"),
				to: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.describe("Inclusive UTC end date"),
			}),
			scopes: ["mcp:nutrition:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				const [goalsOn, manifestOn] = await Promise.all([
					isFeatureEnabled(env, "nutrition-goals", flagContext),
					isFeatureEnabled(env, "nutrition-manifest", flagContext),
				]);
				if (!goalsOn && !manifestOn) {
					return featureDisabled(
						"get_nutrition_summary",
						"Nutrition summary is unavailable while nutrition flags are off.",
						"Enable nutrition-goals or nutrition-manifest for this environment, or use Cargo/Galley/Manifest without intake totals.",
					);
				}
				const parsed = NutritionSummaryQuerySchema.safeParse({
					from: a.from,
					to: a.to,
				});
				if (!parsed.success) {
					return err(
						"get_nutrition_summary",
						"invalid_input",
						"from must be on or before to (YYYY-MM-DD).",
						{ details: parsed.error.flatten() },
					);
				}
				const summary = await getNutritionSummary(
					env.DB,
					ctx.userId,
					ctx.organizationId,
					parsed.data.from,
					parsed.data.to,
				);
				return ok("get_nutrition_summary", summary);
			},
		}),
		defineSharedTool({
			name: "list_nutrition_intakes",
			description:
				"List the caller's personal intake rows for a UTC date range (meal/slot/servings/macros). Requires nutrition-goals or nutrition-manifest. Cursor-paginated (default limit 100, max 200). Not medical advice.",
			inputSchema: z.object({
				from: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.describe("Inclusive UTC start date"),
				to: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.describe("Inclusive UTC end date"),
				limit: z.number().int().min(1).max(200).optional(),
				cursor: z.string().optional(),
			}),
			scopes: ["mcp:nutrition:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				const [goalsOn, manifestOn] = await Promise.all([
					isFeatureEnabled(env, "nutrition-goals", flagContext),
					isFeatureEnabled(env, "nutrition-manifest", flagContext),
				]);
				if (!goalsOn && !manifestOn) {
					return featureDisabled(
						"list_nutrition_intakes",
						"Nutrition intake history is unavailable while nutrition flags are off.",
						"Enable nutrition-goals or nutrition-manifest, or use get_meal_plan for schedule without personal intake rows.",
					);
				}
				const parsed = NutritionSummaryQuerySchema.safeParse({
					from: a.from,
					to: a.to,
				});
				if (!parsed.success) {
					return err(
						"list_nutrition_intakes",
						"invalid_input",
						"from must be on or before to (YYYY-MM-DD).",
						{ details: parsed.error.flatten() },
					);
				}
				const result = await listNutritionIntakesForRange(
					env.DB,
					ctx.userId,
					ctx.organizationId,
					parsed.data.from,
					parsed.data.to,
					{ limit: a.limit ?? 100, cursor: a.cursor },
				);
				return ok(
					"list_nutrition_intakes",
					{ items: result.items },
					{ meta: { nextCursor: result.nextCursor } },
				);
			},
		}),
		defineSharedTool({
			name: "set_nutrition_goal",
			description:
				"Upsert the caller's personal daily nutrition goal (any subset of energy/macros/fiber; at least one required). Requires nutrition-goals and consent:true or legacy consentAt (Art. 9). Not medical advice — do not prescribe diets.",
			inputSchema: z.object({
				dailyEnergyKcal: z
					.number()
					.positive()
					.max(20_000)
					.nullable()
					.optional(),
				proteinG: z.number().nonnegative().max(2_000).nullable().optional(),
				carbsG: z.number().nonnegative().max(2_000).nullable().optional(),
				fatG: z.number().nonnegative().max(2_000).nullable().optional(),
				fiberG: z.number().nonnegative().max(500).nullable().optional(),
				effectiveFrom: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				consentAt: z.coerce.date().optional(),
				consent: z.boolean().optional(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				const enabled = await isFeatureEnabled(
					env,
					"nutrition-goals",
					flagContext,
				);
				if (!enabled) {
					return featureDisabled(
						"set_nutrition_goal",
						"Nutrition goals are unavailable while nutrition-goals is off.",
						"Enable nutrition-goals for this environment, or manage goals later in Hub → Settings when the flag is on.",
					);
				}
				const parsed = NutritionGoalUpsertSchema.safeParse(a);
				if (!parsed.success) {
					return err(
						"set_nutrition_goal",
						"invalid_input",
						"Set at least one nutrient target and provide consent:true or consentAt.",
						{ details: parsed.error.flatten() },
					);
				}
				const surface = resolveAgentSurface(ctx);
				const consentAt = await resolveNutritionGoalConsentAt(
					env.DB,
					ctx.userId,
					surface,
					parsed.data,
				);
				const created = await upsertNutritionGoal(env.DB, {
					userId: ctx.userId,
					dailyEnergyKcal: parsed.data.dailyEnergyKcal,
					proteinG: parsed.data.proteinG,
					carbsG: parsed.data.carbsG,
					fatG: parsed.data.fatG,
					fiberG: parsed.data.fiberG ?? null,
					effectiveFrom: parsed.data.effectiveFrom,
					consentAt,
				});
				return ok("set_nutrition_goal", {
					goal: created ? serializeGoal(created) : null,
				});
			},
		}),
		defineSharedTool({
			name: "clear_nutrition_goal",
			description:
				"Close open-ended nutrition goals so none remain effective on asOfDate (defaults to today UTC). Requires nutrition-goals. Destructive — pass confirm:true.",
			inputSchema: z.object({
				confirm: z.boolean(),
				asOfDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional()
					.describe("UTC date to close goals as of (default: today)"),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
				if (!a.confirm) {
					return err(
						"clear_nutrition_goal",
						"invalid_input",
						"Pass confirm:true to clear nutrition goals.",
					);
				}
				const flagContext = resolveAgentFlagContext(env, ctx);
				const enabled = await isFeatureEnabled(
					env,
					"nutrition-goals",
					flagContext,
				);
				if (!enabled) {
					return featureDisabled(
						"clear_nutrition_goal",
						"Nutrition goals are unavailable while nutrition-goals is off.",
						"Enable nutrition-goals for this environment before clearing goals.",
					);
				}
				const asOfDate = a.asOfDate ?? getUtcTodayISO();
				const cleared = await clearNutritionGoal(env.DB, ctx.userId, asOfDate);
				return ok("clear_nutrition_goal", { cleared, asOfDate, goal: null });
			},
		}),
		defineSharedTool({
			name: "log_manifest_intake",
			description:
				"Log or update personal plate-up (Eat) for prepared Manifest entries. Never deducts Cargo. Requires nutrition-cook-log-split + nutrition-manifest and intake consent (pass consent:true on first grant). Pass portions[{entryId, servings, idempotencyKey}] (1–50). Not medical advice.",
			inputSchema: z.object({
				portions: z.array(intakePortionSchema).min(1).max(50),
				consent: z
					.literal(true)
					.optional()
					.describe(
						"Set true to grant purpose:intake consent on first log when none is active.",
					),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				const surface = resolveAgentSurface(ctx);
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const results: Array<{
					entryId: string;
					intake: Awaited<
						ReturnType<typeof upsertManifestPersonalIntake>
					>["intake"];
					idempotent: boolean;
					replaced: boolean;
				}> = [];
				for (const portion of a.portions) {
					const result = await upsertManifestPersonalIntake(env, {
						organizationId: ctx.organizationId,
						userId: ctx.userId,
						planId: plan.id,
						entryId: portion.entryId,
						servings: portion.servings,
						idempotencyKey: portion.idempotencyKey,
						consent: a.consent,
						consentSource: surface,
						flagContext,
					});
					results.push({
						entryId: portion.entryId,
						intake: result.intake,
						idempotent: result.idempotent,
						replaced: result.replaced,
					});
				}
				return ok("log_manifest_intake", {
					logged: results.length,
					results,
				});
			},
		}),
		defineSharedTool({
			name: "clear_manifest_intake",
			description:
				"Void the caller's active personal intake for prepared Manifest entries (soft-clear). Does not uncook or restore Cargo. Requires nutrition-cook-log-split + nutrition-manifest. Destructive — pass confirm:true.",
			inputSchema: z.object({
				entryIds: z.array(z.string().uuid()).min(1).max(50),
				confirm: z.boolean(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
				if (!a.confirm) {
					return err(
						"clear_manifest_intake",
						"invalid_input",
						"Pass confirm:true to clear personal intake.",
					);
				}
				const flagContext = resolveAgentFlagContext(env, ctx);
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const results: Array<{
					entryId: string;
					cleared: boolean;
					voidedIntakeId: string | null;
				}> = [];
				for (const entryId of a.entryIds) {
					const result = await clearManifestPersonalIntake(env, {
						organizationId: ctx.organizationId,
						userId: ctx.userId,
						planId: plan.id,
						entryId,
						flagContext,
					});
					results.push({
						entryId,
						cleared: result.cleared,
						voidedIntakeId: result.voidedIntakeId,
					});
				}
				return ok("clear_manifest_intake", {
					clearedCount: results.filter((r) => r.cleared).length,
					results,
				});
			},
		}),
	];
}

export function registerNutritionTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	for (const definition of createNutritionToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
