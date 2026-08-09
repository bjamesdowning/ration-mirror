import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
import { getTodayISO } from "~/lib/manifest-dates";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import {
	clearNutritionGoal,
	getActiveNutritionGoal,
	upsertNutritionGoal,
} from "~/lib/nutrition/persist.server";
import { resolveNutritionGoalConsentAt } from "~/lib/nutrition/resolve-goal-consent.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { NutritionGoalUpsertSchema } from "~/lib/schemas/nutrition";
import type { Route } from "./+types/v1.nutrition.goals";

function serializeGoal(
	row: NonNullable<Awaited<ReturnType<typeof getActiveNutritionGoal>>>,
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
		consentAt:
			row.consentAt instanceof Date
				? row.consentAt.toISOString()
				: row.consentAt,
		createdAt:
			row.createdAt instanceof Date
				? row.createdAt.toISOString()
				: row.createdAt,
	};
}

/**
 * GET /api/mobile/v1/nutrition/goals
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileActiveGroup(context, request);
		const env = context.cloudflare.env;
		await assertFeatureEnabled(
			env,
			"nutrition-goals",
			buildFlagContext(request, env, { user: { id: userId } }),
		);

		const goal = await getActiveNutritionGoal(env.DB, userId, getTodayISO());
		return { goal: goal ? serializeGoal(goal) : null };
	} catch (e) {
		return handleApiError(e);
	}
}

/**
 * POST/PATCH /api/mobile/v1/nutrition/goals — upsert.
 * DELETE — clear.
 */
export async function action({ request, context }: Route.ActionArgs) {
	try {
		const { userId } = await requireMobileActiveGroup(context, request);
		const env = context.cloudflare.env;
		await assertFeatureEnabled(
			env,
			"nutrition-goals",
			buildFlagContext(request, env, { user: { id: userId } }),
		);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"settings_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		if (request.method === "DELETE") {
			const clearedCount = await clearNutritionGoal(
				env.DB,
				userId,
				getTodayISO(),
			);
			return { cleared: clearedCount > 0, goal: null };
		}

		if (request.method !== "POST" && request.method !== "PATCH") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const json = await request.json();
		const parsed = NutritionGoalUpsertSchema.safeParse(json);
		if (!parsed.success) {
			throw data(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const consentAt = await resolveNutritionGoalConsentAt(
			env.DB,
			userId,
			"mobile",
			parsed.data,
		);
		const created = await upsertNutritionGoal(env.DB, {
			userId,
			dailyEnergyKcal: parsed.data.dailyEnergyKcal,
			proteinG: parsed.data.proteinG,
			carbsG: parsed.data.carbsG,
			fatG: parsed.data.fatG,
			fiberG: parsed.data.fiberG ?? null,
			effectiveFrom: parsed.data.effectiveFrom,
			consentAt,
		});

		return { goal: created ? serializeGoal(created) : null };
	} catch (e) {
		return handleApiError(e);
	}
}
