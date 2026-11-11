import { data } from "react-router";
import { z } from "zod";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import {
	ensureMealPlan,
	getConsumedIntakeDatesForRange,
	getFuelLoggedDatesForRange,
	getPlannedDatesForRange,
} from "~/lib/manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { serializePlannedDatesResponse } from "~/lib/nutrition/dto.server";
import { isNutritionFuelPageEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { resolveNutritionCapabilities } from "~/lib/nutrition/feature-policy.server";
import { WeekQuerySchema } from "~/lib/schemas/manifest";
import { CalendarDateSchema } from "~/lib/schemas/nutrition-contract";
import type { Route } from "./+types/v1.manifest.planned-dates";

const IntakeMarkerSchema = z.enum(["manifest", "fuel"]);

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

		const intakeRaw = url.searchParams.get("intake");
		const intakeParsed =
			intakeRaw == null
				? { success: true as const, data: "manifest" as const }
				: IntakeMarkerSchema.safeParse(intakeRaw);
		if (!intakeParsed.success) {
			throw data(
				{ error: "Invalid intake marker", code: "invalid_request" },
				{ status: 400 },
			);
		}
		const intake = intakeParsed.data;

		const { startDate: from, endDate: to } = parsed.data;
		if (
			!CalendarDateSchema.safeParse(from).success ||
			!CalendarDateSchema.safeParse(to).success
		) {
			throw data(
				{ error: "Invalid date range", code: "invalid_request" },
				{ status: 400 },
			);
		}
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

		if (intake === "fuel") {
			if (!(await isNutritionFuelPageEnabled(env, flagContext))) {
				throw data(
					{ error: "Fuel is unavailable.", code: "FEATURE_DISABLED" },
					{ status: 403 },
				);
			}
			const consumedDates = await getFuelLoggedDatesForRange(
				env.DB,
				userId,
				from,
				to,
			);
			return serializePlannedDatesResponse({ from, to, dates, consumedDates });
		}

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
