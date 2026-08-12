import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import {
	getConsumedIntakeDatesForRange,
	getMealPlanById,
	getPlannedDatesForRange,
} from "~/lib/manifest.server";
import { resolveNutritionCapabilities } from "~/lib/nutrition/feature-policy.server";
import { WeekQuerySchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/meal-plans.$id.planned-dates";

/**
 * GET /api/meal-plans/:id/planned-dates?from=&to=
 * Returns distinct dates with planned meals. When nutrition-manifest is on,
 * also returns consumedDates (intake calendar days).
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	try {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);
		const planId = params.id;
		if (!planId) throw data({ error: "Plan ID required" }, { status: 400 });

		const plan = await getMealPlanById(
			context.cloudflare.env.DB,
			groupId,
			planId,
		);
		if (!plan) throw data({ error: "Meal plan not found" }, { status: 404 });

		const url = new URL(request.url);
		const parsed = WeekQuerySchema.safeParse({
			startDate: url.searchParams.get("from"),
			endDate: url.searchParams.get("to"),
		});
		if (!parsed.success) {
			throw data(
				{ error: "Invalid date range", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const { startDate: from, endDate: to } = parsed.data;
		const dates = await getPlannedDatesForRange(
			context.cloudflare.env.DB,
			plan.id,
			from,
			to,
		);

		const env = context.cloudflare.env;
		const flagContext = buildWebFlagContext(request, env, { user });
		const caps = await resolveNutritionCapabilities(env, flagContext);

		if (!caps.manifest) {
			return { dates };
		}

		const consumedDates = await getConsumedIntakeDatesForRange(
			env.DB,
			user.id,
			groupId,
			from,
			to,
			{ crossOrgDiary: caps.crossOrgDiary },
		);
		return { dates, consumedDates };
	} catch (e) {
		return handleApiError(e);
	}
}
