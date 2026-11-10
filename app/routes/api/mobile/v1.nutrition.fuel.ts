import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/flags.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { isNutritionFuelPageEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { loadFuelDay } from "~/lib/nutrition/fuel-read.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.nutrition.fuel";

/**
 * GET /api/mobile/v1/nutrition/fuel?date=YYYY-MM-DD
 * The person's Fuel day. `used` and `limit` come from the server.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileActiveGroup(context, request);
		const env = context.cloudflare.env;
		const flags = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});
		if (!(await isNutritionFuelPageEnabled(env, flags))) {
			throw data(
				{ error: "Fuel is unavailable.", code: "FEATURE_DISABLED" },
				{ status: 403 },
			);
		}
		const rate = await checkRateLimit(
			env.RATION_KV,
			"nutrition_summary",
			userId,
		);
		if (!rate.allowed) throw rateLimitResponse(rate);
		const requested = new URL(request.url).searchParams.get("date");
		const date =
			requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
				? requested
				: new Date().toISOString().slice(0, 10);
		const day = await loadFuelDay(env.DB, userId, date);
		return {
			date: day.date,
			week: day.week,
			weekStart: day.weekStart,
			loggedDates: day.loggedDates,
			used: day.used,
			limit: day.limit,
			crew: day.crew,
			diaryLayout: day.diaryLayout,
			fuelTimeZone: day.fuelTimeZone,
			goal: day.goal
				? {
						dailyEnergyKcal: day.goal.dailyEnergyKcal,
						proteinG: day.goal.proteinG,
						carbsG: day.goal.carbsG,
						fatG: day.goal.fatG,
						fiberG: day.goal.fiberG,
					}
				: null,
			totals: day.totals
				? {
						energyKcal: day.totals.energyKcal,
						proteinG: day.totals.proteinG,
						carbsG: day.totals.carbsG,
						fatG: day.totals.fatG,
					}
				: null,
			items: day.items.map((item) => ({
				id: item.id,
				name: item.mealName ?? "Food",
				energyKcal: item.energyKcal,
				proteinG: item.proteinG,
				carbsG: item.carbsG,
				fatG: item.fatG,
				occurredAt: item.occurredAt.toISOString(),
				slotType: item.slotType,
			})),
		};
	} catch (error) {
		return handleApiError(error);
	}
}
