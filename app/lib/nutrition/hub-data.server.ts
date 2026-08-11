/**
 * Load nutrition summary slices for Hub widgets.
 * Soft-fails (null) when flags/consent block reads so Hub still loads.
 */

import { log } from "~/lib/logging.server";
import { getNutritionConsentStatus } from "~/lib/nutrition/consent.server";
import { serializeNutritionSummary } from "~/lib/nutrition/dto.server";
import { resolveNutritionCapabilities } from "~/lib/nutrition/feature-policy.server";
import {
	type NutritionHubRange,
	normalizeNutritionHubRange,
	nutritionRangeBounds,
} from "~/lib/nutrition/hub-widgets";
import {
	getSummary,
	type NutritionFlagContext,
	type NutritionPrincipal,
	type NutritionSurface,
} from "~/lib/nutrition/service.server";
import {
	type NutritionSummary,
	NutritionSummarySchema,
} from "~/lib/schemas/nutrition";

export type HubNutritionPayload = {
	nutritionToday: NutritionSummary | null;
	nutritionTrends: NutritionSummary | null;
};

function emptyPayload(): HubNutritionPayload {
	return { nutritionToday: null, nutritionTrends: null };
}

/** Validate Hub nutrition slice; never poison the whole Hub decode. */
function toHubNutritionSummary(
	serialized: ReturnType<typeof serializeNutritionSummary> | null,
	label: string,
): NutritionSummary | null {
	if (!serialized) return null;
	const candidate = {
		from: serialized.from,
		to: serialized.to,
		totals: serialized.totals,
		days: serialized.days,
		goal: serialized.goal,
	};
	const parsed = NutritionSummarySchema.safeParse(candidate);
	if (!parsed.success) {
		log.warn(`[hub] ${label} summary failed schema validation`, {
			detail: parsed.error.issues[0]?.message ?? "invalid",
		});
		return null;
	}
	return parsed.data;
}

export async function loadHubNutritionData(options: {
	env: Env;
	flagContext: NutritionFlagContext;
	userId: string;
	organizationId: string;
	surface: NutritionSurface;
	authMethod?: string;
	requestId?: string;
	todayVisible: boolean;
	trendsVisible: boolean;
	trendsRange?: number;
}): Promise<HubNutritionPayload> {
	try {
		const {
			env,
			flagContext,
			userId,
			organizationId,
			surface,
			authMethod = surface === "mobile" ? "mobile_bearer" : "session",
			requestId,
			todayVisible,
			trendsVisible,
			trendsRange,
		} = options;

		if (!todayVisible && !trendsVisible) return emptyPayload();

		const caps = await resolveNutritionCapabilities(env, flagContext);
		if (!caps.manifest && !caps.goals) return emptyPayload();

		const intakeConsent = await getNutritionConsentStatus(
			env.DB,
			userId,
			"intake",
		);
		if (intakeConsent.state !== "active") {
			return emptyPayload();
		}

		const principal: NutritionPrincipal = {
			userId,
			organizationId,
			surface,
			authMethod,
			scopes: ["nutrition:read"],
			requestId: requestId ?? crypto.randomUUID(),
		};

		const today = nutritionRangeBounds(7).to;
		const range = normalizeNutritionHubRange(trendsRange) as NutritionHubRange;
		const trendsBounds = nutritionRangeBounds(range, today);

		const [todayResult, trendsResult] = await Promise.all([
			todayVisible
				? getSummary(env, principal, flagContext, today, today)
						.then((s) => serializeNutritionSummary(s))
						.catch((err) => {
							log.error("[hub] nutrition today summary failed", err);
							return null;
						})
				: Promise.resolve(null),
			trendsVisible
				? getSummary(
						env,
						principal,
						flagContext,
						trendsBounds.from,
						trendsBounds.to,
					)
						.then((s) => serializeNutritionSummary(s))
						.catch((err) => {
							log.error("[hub] nutrition trends summary failed", err);
							return null;
						})
				: Promise.resolve(null),
		]);

		return {
			nutritionToday: toHubNutritionSummary(todayResult, "nutritionToday"),
			nutritionTrends: toHubNutritionSummary(trendsResult, "nutritionTrends"),
		};
	} catch (err) {
		log.error("[hub] nutrition load failed", err);
		return emptyPayload();
	}
}
