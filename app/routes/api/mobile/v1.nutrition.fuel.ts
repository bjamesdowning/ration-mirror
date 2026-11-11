import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/flags.server";
import { log } from "~/lib/logging.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { isNutritionFuelPageEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { selectPublishableFuelItems } from "~/lib/nutrition/fuel-dto.server";
import { loadFuelDay } from "~/lib/nutrition/fuel-read.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { CalendarDateSchema } from "~/lib/schemas/nutrition-contract";
import type { Route } from "./+types/v1.nutrition.fuel";

function finiteTotal(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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
		let date = new Date().toISOString().slice(0, 10);
		if (requested) {
			const parsedDate = CalendarDateSchema.safeParse(requested);
			if (!parsedDate.success) {
				throw data(
					{ error: "Invalid date", code: "invalid_request" },
					{ status: 400 },
				);
			}
			date = parsedDate.data;
		}
		const day = await loadFuelDay(env.DB, userId, date);
		const items = selectPublishableFuelItems(day.items, (diagnostic) => {
			log.warn("fuel_day_rows_skipped", {
				code: diagnostic.code,
				skipped: diagnostic.skipped,
			});
		});
		const energyKcal = finiteTotal(day.totals?.energyKcal);
		const proteinG = finiteTotal(day.totals?.proteinG);
		const carbsG = finiteTotal(day.totals?.carbsG);
		const fatG = finiteTotal(day.totals?.fatG);
		const totals =
			day.totals &&
			energyKcal != null &&
			proteinG != null &&
			carbsG != null &&
			fatG != null
				? { energyKcal, proteinG, carbsG, fatG }
				: null;
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
			totals,
			items,
		};
	} catch (error) {
		return handleApiError(error);
	}
}
