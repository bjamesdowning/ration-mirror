import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import {
	ensureMealPlan,
	getConsumedIntakeDatesForRange,
	getPlannedDatesForRange,
} from "~/lib/manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { serializePlannedDatesResponse } from "~/lib/nutrition/dto.server";
import { resolveNutritionCapabilities } from "~/lib/nutrition/feature-policy.server";
import { WeekQuerySchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/v1.manifest.planned-dates";

/**
 * GET /api/mobile/v1/manifest/planned-dates?from=&to=
 * Month-scoped planned (and optional intake) calendar markers.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

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
		// Guard against accidental 13-month fetches — calendar UI loads one month.
		const fromTime = Date.parse(`${from}T00:00:00.000Z`);
		const toTime = Date.parse(`${to}T00:00:00.000Z`);
		if (
			!Number.isFinite(fromTime) ||
			!Number.isFinite(toTime) ||
			toTime < fromTime ||
			(toTime - fromTime) / (24 * 60 * 60 * 1000) > 40
		) {
			throw data(
				{ error: "Date range must be at most 40 days" },
				{ status: 400 },
			);
		}

		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);
		const dates = await getPlannedDatesForRange(
			context.cloudflare.env.DB,
			plan.id,
			from,
			to,
		);

		const env = context.cloudflare.env;
		const flagContext = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});
		const caps = await resolveNutritionCapabilities(env, flagContext);

		if (!caps.manifest) {
			return serializePlannedDatesResponse({ from, to, dates });
		}

		const consumedDates = await getConsumedIntakeDatesForRange(
			env.DB,
			userId,
			organizationId,
			from,
			to,
			{ crossOrgDiary: caps.crossOrgDiary },
		);
		return serializePlannedDatesResponse({ from, to, dates, consumedDates });
	} catch (e) {
		return handleApiError(e);
	}
}
