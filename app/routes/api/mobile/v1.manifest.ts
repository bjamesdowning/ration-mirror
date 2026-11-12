import { data } from "react-router";
import { getUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	addEntry,
	ensureMealPlan,
	getWeekEntries,
	getWeekStart,
} from "~/lib/manifest.server";
import { getCalendarDates } from "~/lib/manifest-dates";
import { getExcludedManifestDates } from "~/lib/manifest-supply.server";
import {
	serializeManifestEntriesForWire,
	serializeManifestEntryForWire,
} from "~/lib/manifest-wire.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getNutritionConsentStatus } from "~/lib/nutrition/consent.server";
import { isPlanFuelActionsEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { toManifestDayIntake } from "~/lib/nutrition/fuel-capture";
import {
	attachPersonalIntakeToEntries,
	getHistory,
} from "~/lib/nutrition/service.server";
import { kitchenTodayForOrganization } from "~/lib/org-supply-settings.server";
import { listCargoLinesForRange } from "~/lib/plan-fuel-actions.server";
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
					?.weekStart ?? "sunday";
			const span =
				(settings.manifestSettings as { calendarSpan?: 1 | 3 | 5 | 7 })
					?.calendarSpan ?? 5;
			const anchor = await kitchenTodayForOrganization(
				context.cloudflare.env.DB,
				organizationId,
			);
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
		let dayIntakeRows:
			| Array<{
					id: string;
					manifestDate: string;
					slotType: string | null;
					servings: number;
					energyKcal: number;
					proteinG: number;
					carbsG: number;
					fatG: number;
					mealName: string | null;
					organizationName: string | null;
					notes: string | null;
			  }>
			| undefined;
		if (cookLogSplit && nutritionManifest) {
			const consent = await getNutritionConsentStatus(
				context.cloudflare.env.DB,
				userId,
				"intake",
			);
			intakeConsentGranted = consent.state === "active";
			if (intakeConsentGranted) {
				const principal = {
					userId,
					organizationId,
					surface: "mobile" as const,
					authMethod: "mobile_bearer",
					scopes: ["nutrition:read"],
					requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
				};
				const [withIntake, history] = await Promise.all([
					attachPersonalIntakeToEntries(
						context.cloudflare.env,
						principal,
						flagContext,
						entries,
					),
					getHistory(
						context.cloudflare.env,
						principal,
						flagContext,
						parsed.data.startDate,
						parsed.data.endDate,
					),
				]);
				entries = withIntake;
				dayIntakeRows = history.items.map((r) => toManifestDayIntake(r));
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

		const showCargoLines = await isPlanFuelActionsEnabled(
			context.cloudflare.env,
			flagContext,
		);
		const cargoLines = showCargoLines
			? await listCargoLinesForRange(
					context.cloudflare.env.DB,
					plan.id,
					parsed.data.startDate,
					parsed.data.endDate,
				)
			: undefined;

		return {
			plan: {
				id: plan.id,
				name: plan.name,
			},
			startDate: parsed.data.startDate,
			endDate: parsed.data.endDate,
			entries: serializeManifestEntriesForWire(entries),
			...(cargoLines ? { cargoLines } : {}),
			supplyDayInclusion,
			...(intakeConsentGranted !== undefined ? { intakeConsentGranted } : {}),
			...(dayIntakeRows !== undefined ? { dayIntakeRows } : {}),
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
		return { entry: serializeManifestEntryForWire(entry) };
	} catch (e) {
		return handleApiError(e);
	}
}
