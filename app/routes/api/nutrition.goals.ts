import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
import { getTodayISO } from "~/lib/manifest-dates";
import {
	clearNutritionGoal,
	getActiveNutritionGoal,
	upsertNutritionGoal,
} from "~/lib/nutrition/persist.server";
import { resolveNutritionGoalConsentAt } from "~/lib/nutrition/resolve-goal-consent.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { NutritionGoalUpsertSchema } from "~/lib/schemas/nutrition";
import type { Route } from "./+types/nutrition.goals";

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
 * GET /api/nutrition/goals — current effective goal for today (UTC).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const {
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		await assertFeatureEnabled(
			env,
			"nutrition-goals",
			buildFlagContext(request, env, { user }),
		);

		const goal = await getActiveNutritionGoal(env.DB, user.id, getTodayISO());
		return { goal: goal ? serializeGoal(goal) : null };
	} catch (e) {
		return handleApiError(e);
	}
}

/**
 * POST/PATCH /api/nutrition/goals — upsert goal (requires consentAt).
 * DELETE — clear open-ended goals.
 */
export async function action({ request, context }: Route.ActionArgs) {
	try {
		const {
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		await assertFeatureEnabled(
			env,
			"nutrition-goals",
			buildFlagContext(request, env, { user }),
		);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"settings_mutation",
			user.id,
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
				user.id,
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
			user.id,
			"web",
			parsed.data,
		);
		const created = await upsertNutritionGoal(env.DB, {
			userId: user.id,
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
