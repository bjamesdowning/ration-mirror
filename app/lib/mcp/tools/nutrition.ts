import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUtcTodayISO } from "../../cargo-utils";
import { isFeatureEnabled } from "../../feature-flags/flags.server";
import {
	buildMinimalFlagContext,
	clearNutritionGoal,
	getNutritionSummary,
	upsertNutritionGoal,
} from "../../nutrition/persist.server";
import { resolveNutritionGoalConsentAt } from "../../nutrition/resolve-goal-consent.server";
import {
	NutritionGoalUpsertSchema,
	NutritionSummaryQuerySchema,
} from "../../schemas/nutrition";
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

export function createNutritionToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "get_nutrition_summary",
			description:
				"Return daily nutrition intake totals (energy + macros) for a UTC date range, plus the active goal when set. Requires nutrition-goals or nutrition-manifest. Not medical advice.",
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
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				const flagContext = buildMinimalFlagContext(env, ctx.userId);
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
			name: "set_nutrition_goal",
			description:
				"Upsert the caller's personal daily nutrition goal (any subset of energy/macros; at least one required). Requires nutrition-goals and consent:true or legacy consentAt (Art. 9). Not medical advice — do not prescribe diets.",
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
			scopes: ["mcp:preferences:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const flagContext = buildMinimalFlagContext(env, ctx.userId);
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
				const consentAt = await resolveNutritionGoalConsentAt(
					env.DB,
					ctx.userId,
					"mcp",
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
			scopes: ["mcp:preferences:write"],
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
				const flagContext = buildMinimalFlagContext(env, ctx.userId);
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
