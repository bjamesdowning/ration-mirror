import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUtcTodayISO } from "../../cargo-utils";
import { isFeatureEnabled } from "../../feature-flags/flags.server";
import { ensureMealPlan } from "../../manifest.server";
import {
	serializeNutritionGoal,
	serializeNutritionSummary,
} from "../../nutrition/dto.server";
import {
	clearGoal,
	clearManifestIntakes,
	deriveNutritionOperationKey,
	getHistory,
	getSummary,
	logManifestIntakes,
	setGoal,
} from "../../nutrition/service.server";
import { IntakeNotesSchema } from "../../schemas/manifest";
import {
	NutritionGoalUpsertSchema,
	NutritionSummaryQuerySchema,
} from "../../schemas/nutrition";
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
import { createQuickEatToolDefs } from "./quick-eat";

function nutritionPrincipal(ctx: McpToolContext) {
	const surface = resolveAgentSurface(ctx);
	return {
		userId: ctx.userId,
		organizationId: ctx.organizationId,
		surface,
		authMethod: ctx.authMethod,
		credentialId: ctx.apiKeyId || null,
		clientId: ctx.oauthClientId ?? null,
		scopes: [
			...(ctx.scopes.includes("mcp:nutrition:read") ? ["nutrition:read"] : []),
			...(ctx.scopes.includes("mcp:nutrition:write")
				? ["nutrition:write"]
				: []),
		],
		requestId: crypto.randomUUID(),
	};
}

const intakePortionSchema = z.object({
	entryId: z.string().uuid(),
	servings: z.number().min(0.5).max(100),
	idempotencyKey: z.string().uuid(),
	notes: IntakeNotesSchema,
});

export function createNutritionToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "get_nutrition_summary",
			description:
				"Return the caller's personal daily nutrition intake totals (energy, macros, optional fiberG) for a UTC date range, plus the active goal when set. Use this when the user asks remaining calories or whether a meal fits their budget — read vsGoal (and nutritionV2.vsGoal); do not subtract consumed from target yourself. from/to default to today UTC (temporal.todayUtc). Remaining is the UTC calendar day, not a dinner-only slice. When nutrition-cross-org-diary is on, totals include intakes from every kitchen the user logged in — not only the authorized household. Requires nutrition-goals or nutrition-manifest. Not medical advice.",
			inputSchema: z.object({
				from: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional()
					.describe("Inclusive UTC start date (defaults to today UTC)"),
				to: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional()
					.describe("Inclusive UTC end date (defaults to today UTC)"),
			}),
			scopes: ["mcp:nutrition:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			readOnlyHint: true,
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
				const today = getUtcTodayISO();
				const parsed = NutritionSummaryQuerySchema.safeParse({
					from: a.from ?? today,
					to: a.to ?? today,
				});
				if (!parsed.success) {
					return err(
						"get_nutrition_summary",
						"invalid_input",
						"from must be on or before to (YYYY-MM-DD).",
						{ details: parsed.error.flatten() },
					);
				}
				const principal = nutritionPrincipal(ctx);
				const summary = await getSummary(
					env,
					principal,
					flagContext,
					parsed.data.from,
					parsed.data.to,
				);
				return ok("get_nutrition_summary", serializeNutritionSummary(summary), {
					outcome: "no_effect",
					requestId: principal.requestId,
				});
			},
		}),
		defineSharedTool({
			name: "list_nutrition_intakes",
			description:
				"List the caller's personal intake rows for a UTC date range (meal/slot/servings/macros/optional notes and kitchen labels). When nutrition-cross-org-diary is on, includes rows from every kitchen — not only the authorized household. Requires nutrition-goals or nutrition-manifest. Cursor-paginated (default limit 100, max 200). Not medical advice.",
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
			readOnlyHint: true,
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
				const principal = nutritionPrincipal(ctx);
				const result = await getHistory(
					env,
					principal,
					flagContext,
					parsed.data.from,
					parsed.data.to,
					{ limit: a.limit ?? 100, cursor: a.cursor },
				);
				return ok(
					"list_nutrition_intakes",
					{ items: result.items },
					{
						meta: { nextCursor: result.nextCursor },
						outcome: "no_effect",
						requestId: principal.requestId,
					},
				);
			},
		}),
		defineSharedTool({
			name: "set_nutrition_goal",
			description:
				"Idempotently upsert the caller's personal daily nutrition goal (any subset of energy/macros/fiber; at least one required) using operationKey. Requires active goals and agent-processing consent established in Ration. Not medical advice — do not prescribe diets.",
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
				operationKey: z.string().uuid(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			idempotentHint: true,
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
						"Set at least one nutrient target.",
						{ details: parsed.error.flatten() },
					);
				}
				const principal = nutritionPrincipal(ctx);
				const result = await setGoal(env, principal, flagContext, {
					operationKey: parsed.data.operationKey,
					dailyEnergyKcal: parsed.data.dailyEnergyKcal,
					proteinG: parsed.data.proteinG,
					carbsG: parsed.data.carbsG,
					fatG: parsed.data.fatG,
					fiberG: parsed.data.fiberG ?? null,
					effectiveFrom: parsed.data.effectiveFrom,
				});
				return ok(
					"set_nutrition_goal",
					{
						goal: serializeNutritionGoal(result.goal),
						operationId: result.operationId,
						replayed: result.replayed,
					},
					{
						outcome: result.replayed ? "replayed" : "committed",
						requestId: principal.requestId,
						operationId: result.operationId,
					},
				);
			},
		}),
		defineSharedTool({
			name: "clear_nutrition_goal",
			description:
				"Idempotently close open-ended nutrition goals using operationKey so none remain effective on asOfDate (defaults to today UTC). Requires nutrition-goals. Destructive — pass confirm:true.",
			inputSchema: z.object({
				confirm: z.boolean(),
				asOfDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional()
					.describe("UTC date to close goals as of (default: today)"),
				operationKey: z.string().uuid(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			destructiveHint: true,
			idempotentHint: true,
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
				const principal = nutritionPrincipal(ctx);
				const result = await clearGoal(env, principal, flagContext, {
					operationKey: a.operationKey,
					asOfDate,
				});
				return ok(
					"clear_nutrition_goal",
					{ ...result, asOfDate },
					{
						outcome: result.replayed
							? "replayed"
							: result.cleared
								? "committed"
								: "no_effect",
						requestId: principal.requestId,
						operationId: result.operationId,
					},
				);
			},
		}),
		defineSharedTool({
			name: "log_manifest_intake",
			description:
				"Atomically log or update personal plate-up (Eat) for prepared Manifest entries. Never deducts Cargo. Requires active intake and agent-processing consent established in Ration. Pass operationKey plus portions[{entryId, servings, idempotencyKey, notes?}] (1–50); optional notes (≤280) persist only when nutrition-intake-notes is on. During the compatibility window, omission derives a stable operation key from the ordered item keys. Returns stable replay semantics and authoritative day totals. Not medical advice.",
			inputSchema: z.object({
				portions: z.array(intakePortionSchema).min(1).max(50),
				operationKey: z.string().uuid().optional(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			idempotentHint: true,
			needsApproval: (args) =>
				Array.isArray(args.portions) && args.portions.length > 1,
			handler: async (ctx, a) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				const plan = await ensureMealPlan(env.DB, ctx.organizationId);
				const principal = nutritionPrincipal(ctx);
				const result = await logManifestIntakes(env, principal, flagContext, {
					operationKey:
						a.operationKey ??
						(await deriveNutritionOperationKey(
							a.portions.map((portion) => portion.idempotencyKey),
						)),
					planId: plan.id,
					items: a.portions,
				});
				return ok(
					"log_manifest_intake",
					{
						logged: result.items.length,
						...result,
					},
					{
						outcome: result.replayed ? "replayed" : "committed",
						requestId: principal.requestId,
						operationId: result.operationId,
					},
				);
			},
		}),
		defineSharedTool({
			name: "clear_manifest_intake",
			description:
				"Atomically void the caller's active personal intake for prepared Manifest entries (soft-clear) using operationKey. Does not uncook or restore Cargo. Requires nutrition-cook-log-split + nutrition-manifest. Destructive — pass confirm:true.",
			inputSchema: z.object({
				entryIds: z.array(z.string().uuid()).min(1).max(50),
				confirm: z.boolean(),
				operationKey: z.string().uuid(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			destructiveHint: true,
			idempotentHint: true,
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
				const principal = nutritionPrincipal(ctx);
				const result = await clearManifestIntakes(env, principal, flagContext, {
					operationKey: a.operationKey,
					planId: plan.id,
					entryIds: a.entryIds,
				});
				return ok(
					"clear_manifest_intake",
					{
						clearedCount: result.items.filter((item) => item.voidedIntakeId)
							.length,
						...result,
					},
					{
						outcome: result.replayed ? "replayed" : "committed",
						requestId: principal.requestId,
						operationId: result.operationId,
					},
				);
			},
		}),
		...createQuickEatToolDefs(env),
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
