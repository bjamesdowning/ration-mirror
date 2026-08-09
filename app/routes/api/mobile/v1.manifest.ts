import { data } from "react-router";
import { getUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	addEntry,
	ensureMealPlan,
	getTodayISO,
	getWeekEntries,
	getWeekStart,
} from "~/lib/manifest.server";
import { getCalendarDates } from "~/lib/manifest-dates";
import { getExcludedManifestDates } from "~/lib/manifest-supply.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getNutritionConsentStatus } from "~/lib/nutrition/consent.server";
import { attachPersonalIntakeToEntries } from "~/lib/nutrition/service.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	MealPlanEntryCreateSchema,
	WeekQuerySchema,
} from "~/lib/schemas/manifest";
import type { Route } from "./+types/v1.manifest";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const url = new URL(request.url);
		const startParam = url.searchParams.get("startDate");
		const endParam = url.searchParams.get("endDate");

		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);

		let startDate = startParam;
		let endDate = endParam;
		if (!startDate || !endDate) {
			const settings = await getUserSettings(context.cloudflare.env.DB, userId);
			const weekStart =
				(settings.manifestSettings as { weekStart?: "sunday" | "monday" })
					?.weekStart ?? "monday";
			const span =
				(settings.manifestSettings as { calendarSpan?: 3 | 5 | 7 })
					?.calendarSpan ?? 5;
			const anchor = getTodayISO();
			const resolvedAnchor =
				span === 7 ? getWeekStart(anchor, weekStart) : anchor;
			const dates = getCalendarDates(span, resolvedAnchor, weekStart);
			startDate = dates[0];
			endDate = dates[dates.length - 1];
		}

		const parsed = WeekQuerySchema.safeParse({ startDate, endDate });
		if (!parsed.success) {
			throw handleApiError(parsed.error);
		}

		let entries = await getWeekEntries(
			context.cloudflare.env.DB,
			plan.id,
			parsed.data.startDate,
			parsed.data.endDate,
		);

		const flagContext = buildMobileFlagContext(
			request,
			context.cloudflare.env,
			{
				user: { id: userId },
			},
		);
		const [cookLogSplit, nutritionManifest] = await Promise.all([
			isFeatureEnabled(
				context.cloudflare.env,
				"nutrition-cook-log-split",
				flagContext,
			),
			isFeatureEnabled(
				context.cloudflare.env,
				"nutrition-manifest",
				flagContext,
			),
		]);

		let intakeConsentGranted: boolean | undefined;
		if (cookLogSplit && nutritionManifest) {
			const consent = await getNutritionConsentStatus(
				context.cloudflare.env.DB,
				userId,
				"intake",
			);
			intakeConsentGranted = consent.state === "active";
			if (intakeConsentGranted) {
				entries = await attachPersonalIntakeToEntries(
					context.cloudflare.env,
					{
						userId,
						organizationId,
						surface: "mobile",
						authMethod: "mobile_bearer",
						scopes: ["nutrition:read"],
						requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
					},
					flagContext,
					entries,
				);
			}
		}

		const excludedDates = await getExcludedManifestDates(
			context.cloudflare.env.DB,
			organizationId,
			parsed.data.startDate,
			parsed.data.endDate,
		);
		const supplyDayInclusion: Record<string, boolean> = {};
		for (const date of excludedDates) {
			supplyDayInclusion[date] = false;
		}

		return {
			plan: {
				id: plan.id,
				name: plan.name,
			},
			startDate: parsed.data.startDate,
			endDate: parsed.data.endDate,
			entries,
			supplyDayInclusion,
			...(intakeConsentGranted !== undefined ? { intakeConsentGranted } : {}),
		};
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"grocery_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const body = await request.json();
		const input = MealPlanEntryCreateSchema.parse(body);
		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);
		const entry = await addEntry(
			context.cloudflare.env.DB,
			organizationId,
			plan.id,
			input,
		);
		return { entry };
	} catch (e) {
		return handleApiError(e);
	}
}
