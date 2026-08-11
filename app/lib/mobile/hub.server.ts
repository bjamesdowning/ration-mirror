import { resolveLayout } from "~/components/hub/widgets/registry";
import { getUserSettings } from "~/lib/auth.server";
import { getCargoStats, getExpiringCargo } from "~/lib/cargo.server";
import { buildMobileFlagContext } from "~/lib/feature-flags/flags.server";
import { getHubMealMatchWidgets } from "~/lib/hub-match.server";
import { getKitchenEvents, getKitchenStats } from "~/lib/kitchen-events.server";
import { log } from "~/lib/logging.server";
import { getDistinctMealTags, getManifestPreview } from "~/lib/manifest.server";
import { MEAL_MATCH_CANDIDATE_CAP } from "~/lib/matching.server";
import { resolveNutritionCapabilities } from "~/lib/nutrition/feature-policy.server";
import { loadHubNutritionData } from "~/lib/nutrition/hub-data.server";
import { isNutritionHubWidgetsEnabled } from "~/lib/nutrition/hub-widgets";
import { HubLayoutSchema } from "~/lib/schemas/hub";
import {
	MobileHubMealMatchSchema,
	MobileHubResponseSchema,
} from "~/lib/schemas/mobile/hub";
import {
	filterSupplyItemsByCargoTags,
	getSupplyItemStats,
	getSupplyList,
} from "~/lib/supply.server";
import { getCargoTagIndex, getOrganizationTagSlugs } from "~/lib/tags.server";
import type { HubProfile } from "~/lib/types";

/**
 * @deprecated Use `MEAL_MATCH_CANDIDATE_CAP` — kept as an alias so older
 * imports keep compiling during the P1-A rollout.
 */
export const MOBILE_PRE_LIMIT = MEAL_MATCH_CANDIDATE_CAP;
const MOBILE_MAX_WIDGET_LIMIT = 20;
const MOBILE_MANIFEST_ENTRY_CAP = 50;
export const MOBILE_SUPPLY_ITEMS_SLICE = 20;

const DEFAULT_EXPIRATION_ALERT_DAYS = 7;
const MAX_EXPIRATION_ALERT_DAYS = 90;
const MOBILE_HUB_PROFILES = new Set<HubProfile>([
	"cook",
	"shop",
	"minimal",
	"full",
	"custom",
]);

/**
 * User settings are persisted JSON and may predate the current schema.
 * Never echo a malformed custom layout to the strict mobile Codable contract.
 */
function sanitizeHubLayout(value: unknown) {
	if (value == null) return undefined;
	const parsed = HubLayoutSchema.safeParse(value);
	if (parsed.success) return parsed.data;
	log.warn("[hub] ignoring invalid persisted layout for mobile response", {
		detail: parsed.error.issues[0]?.message ?? "invalid",
	});
	return undefined;
}

/** Mobile expects this preference as an Int; malformed legacy values use default. */
function sanitizeExpirationAlertDays(value: unknown): number {
	if (
		typeof value === "number" &&
		Number.isSafeInteger(value) &&
		value >= 1 &&
		value <= MAX_EXPIRATION_ALERT_DAYS
	) {
		return value;
	}
	return DEFAULT_EXPIRATION_ALERT_DAYS;
}

function sanitizeHubProfile(value: unknown): HubProfile | undefined {
	if (typeof value !== "string") return undefined;
	const candidate = value as HubProfile;
	return MOBILE_HUB_PROFILES.has(candidate) ? candidate : undefined;
}

/**
 * Drop an optional match card whose stored integer fields violate the mobile
 * contract. A malformed historical meal must not break the whole Hub.
 */
function sanitizeMobileMealMatches<T>(matches: T[], label: string): T[] {
	const valid: T[] = [];
	let dropped = 0;
	for (const match of matches) {
		if (MobileHubMealMatchSchema.safeParse(match).success) {
			valid.push(match);
		} else {
			dropped += 1;
		}
	}
	if (dropped > 0) {
		log.warn("[hub] omitted invalid mobile meal matches", {
			detail: `${label}:${dropped}`,
		});
	}
	return valid;
}

/**
 * Validate the full response before it crosses the Worker boundary. If a
 * legacy row violates an optional widget contract, omit widget data rather
 * than failing the entire Hub. Log only the schema path, never response data.
 */
function validateMobileHubResponse(payload: unknown) {
	const parsed = MobileHubResponseSchema.safeParse(payload);
	if (parsed.success) return parsed.data;

	log.warn("[hub] omitted invalid optional data from mobile response", {
		detail: parsed.error.issues[0]?.path.join(".") || "unknown",
	});
	const response = payload as Record<string, unknown>;
	const fallback = {
		...response,
		expiringItems: [],
		cargoStats: { totalItems: 0, expiringCount: 0, expiredCount: 0 },
		latestSupplyList: null,
		manifestPreview: null,
		hubLayout: undefined,
		availableMealTags: [],
		availableCargoTags: [],
		cargoTagIndex: [],
		mealMatches: [],
		partialMealMatches: [],
		snackMatches: [],
		flightRecorderActivity: null,
		nutritionToday: null,
		nutritionTrends: null,
	};
	const fallbackParsed = MobileHubResponseSchema.safeParse(fallback);
	if (fallbackParsed.success) return fallbackParsed.data;

	throw new Error("Unable to create a valid mobile Hub response");
}

function clampWidgetLimit(value: number | undefined, fallback: number): number {
	const base = value ?? fallback;
	return Math.min(Math.max(base, 1), MOBILE_MAX_WIDGET_LIMIT);
}

function settledOrEmpty<T>(
	result: PromiseSettledResult<T>,
	fallback: T,
	label: string,
): T {
	if (result.status === "fulfilled") return result.value;
	log.error(`[hub] tag enrichment failed: ${label}`, result.reason);
	return fallback;
}

export async function getMobileHubData(
	env: Cloudflare.Env,
	organizationId: string,
	userId: string,
	request?: Request,
) {
	const db = env.DB;
	const settings = await getUserSettings(db, userId);
	const expirationAlertDays = sanitizeExpirationAlertDays(
		settings.expirationAlertDays,
	);
	const hubProfile = sanitizeHubProfile(settings.hubProfile);
	const hubLayout = sanitizeHubLayout(settings.hubLayout);

	const resolvedWidgets = resolveLayout(hubProfile, hubLayout);
	const findWidget = (id: string) => resolvedWidgets.find((w) => w.id === id);

	const mealsReadyConfig = findWidget("meals-ready");
	const mealsPartialConfig = findWidget("meals-partial");
	const snacksReadyConfig = findWidget("snacks-ready");
	const cargoExpiringConfig = findWidget("cargo-expiring");
	const manifestPreviewConfig = findWidget("manifest-preview");
	const supplyPreviewConfig = findWidget("supply-preview");
	const nutritionTodayConfig = findWidget("nutrition-today");
	const nutritionTrendsConfig = findWidget("nutrition-trends");
	const flightRecorderVisible =
		findWidget("flight-recorder")?.visible !== false &&
		resolvedWidgets.some((w) => w.id === "flight-recorder" && w.visible);

	const flagContext = request
		? buildMobileFlagContext(request, env, { user: { id: userId } })
		: buildMobileFlagContext(
				new Request("https://ration.local/api/mobile/v1/hub"),
				env,
				{ user: { id: userId } },
			);
	const caps = await resolveNutritionCapabilities(env, flagContext);
	const nutritionWidgetsEnabled = isNutritionHubWidgetsEnabled({
		nutritionManifest: caps.manifest,
		nutritionGoals: caps.goals,
	});
	const nutritionTodayVisible =
		nutritionWidgetsEnabled && nutritionTodayConfig?.visible === true;
	const nutritionTrendsVisible =
		nutritionWidgetsEnabled && nutritionTrendsConfig?.visible === true;

	const cargoLimit = clampWidgetLimit(cargoExpiringConfig?.filters?.limit, 10);
	const cargoDomain = cargoExpiringConfig?.filters?.domain;
	const manifestSlotType = manifestPreviewConfig?.filters?.slotType;
	const manifestDaySpan = manifestPreviewConfig?.filters?.daySpan ?? 7;
	const manifestTags = manifestPreviewConfig?.filters?.tags;
	const supplyLimit = clampWidgetLimit(supplyPreviewConfig?.filters?.limit, 6);
	const supplyTags = supplyPreviewConfig?.filters?.supplyTags;
	// Tag filtering must inspect every item's name to match against cargo tags,
	// so it needs the full row set. The common (untag-filtered) case fetches a
	// bounded slice instead and gets its counts from a separate COUNT query —
	// see getSupplyItemStats — avoiding a full-table read on every /hub call.
	const supplyTagFilterActive = (supplyTags?.length ?? 0) > 0;

	const mealsReadyLimit = clampWidgetLimit(mealsReadyConfig?.filters?.limit, 6);
	const mealsPartialLimit = clampWidgetLimit(
		mealsPartialConfig?.filters?.limit,
		6,
	);
	const snacksReadyLimit = clampWidgetLimit(
		snacksReadyConfig?.filters?.limit,
		6,
	);

	// Critical Hub widgets — failures here still fail the request.
	const [
		expiringItems,
		cargoStats,
		latestSupplyListRaw,
		manifestPreviewRaw,
		hubMatches,
		flightRecorderStats,
		flightRecorderRecent,
		nutritionPayload,
	] = await Promise.all([
		getExpiringCargo(
			db,
			organizationId,
			expirationAlertDays,
			cargoLimit,
			cargoDomain,
		),
		getCargoStats(db, organizationId),
		getSupplyList(
			db,
			organizationId,
			supplyTagFilterActive ? undefined : { limit: MOBILE_SUPPLY_ITEMS_SLICE },
		),
		getManifestPreview(
			db,
			organizationId,
			manifestDaySpan,
			manifestSlotType,
			manifestTags,
		),
		getHubMealMatchWidgets(env, organizationId, {
			mealsReady: {
				limit: mealsReadyLimit,
				tags: mealsReadyConfig?.filters?.tags,
			},
			mealsPartial: {
				limit: mealsPartialLimit,
				tags: mealsPartialConfig?.filters?.tags,
			},
			snacksReady: {
				limit: snacksReadyLimit,
				tags: snacksReadyConfig?.filters?.tags,
			},
		}),
		flightRecorderVisible
			? getKitchenStats(db, organizationId, "7d")
			: Promise.resolve(null),
		flightRecorderVisible
			? getKitchenEvents(db, organizationId, { limit: 5 }).then((r) => r.events)
			: Promise.resolve([]),
		loadHubNutritionData({
			env,
			flagContext,
			userId,
			organizationId,
			surface: "mobile",
			requestId: request?.headers.get("cf-ray") ?? undefined,
			todayVisible: nutritionTodayVisible,
			trendsVisible: nutritionTrendsVisible,
			trendsRange: nutritionTrendsConfig?.filters?.nutritionRange,
		}),
	]);

	// Tag pickers are best-effort. cargoTagIndex is critical when the supply
	// widget filters by cargo tags — an empty index would wipe the filtered list.
	const [mealTagsResult, cargoSlugsResult, cargoTagIndexResult] =
		await Promise.allSettled([
			getDistinctMealTags(db, organizationId),
			getOrganizationTagSlugs(db, organizationId),
			getCargoTagIndex(db, organizationId),
		]);

	const availableMealTags = settledOrEmpty(
		mealTagsResult,
		[] as string[],
		"availableMealTags",
	);
	const availableCargoTags = settledOrEmpty(
		cargoSlugsResult,
		[] as string[],
		"availableCargoTags",
	).sort();

	let cargoTagIndex: Awaited<ReturnType<typeof getCargoTagIndex>>;
	if (supplyTagFilterActive) {
		if (cargoTagIndexResult.status === "rejected") {
			throw cargoTagIndexResult.reason;
		}
		cargoTagIndex = cargoTagIndexResult.value;
	} else {
		cargoTagIndex = settledOrEmpty(
			cargoTagIndexResult,
			[] as Awaited<ReturnType<typeof getCargoTagIndex>>,
			"cargoTagIndex",
		);
	}

	const mealMatches = sanitizeMobileMealMatches(
		hubMatches.mealMatches,
		"mealMatches",
	);
	const partialMealMatches = sanitizeMobileMealMatches(
		hubMatches.partialMealMatches,
		"partialMealMatches",
	);
	const snackMatches = sanitizeMobileMealMatches(
		hubMatches.snackMatches,
		"snackMatches",
	);
	// Only queried when the widget isn't tag-filtered — see supplyTagFilterActive above.
	const supplyStats =
		latestSupplyListRaw && !supplyTagFilterActive
			? await getSupplyItemStats(db, latestSupplyListRaw.id)
			: null;

	const latestSupplyList = latestSupplyListRaw
		? (() => {
				const filteredItems = filterSupplyItemsByCargoTags(
					latestSupplyListRaw.items ?? [],
					cargoTagIndex,
					supplyTags,
				);
				const purchasedCount = supplyStats
					? supplyStats.purchasedCount
					: filteredItems.filter((i) => i.isPurchased).length;
				const itemCount = supplyStats
					? supplyStats.itemCount
					: filteredItems.length;
				const uncheckedCount = supplyStats
					? supplyStats.itemCount - supplyStats.purchasedCount
					: filteredItems.length - purchasedCount;
				const displayItems = filteredItems.slice(
					0,
					Math.min(supplyLimit, MOBILE_SUPPLY_ITEMS_SLICE),
				);
				return {
					...latestSupplyListRaw,
					itemCount,
					uncheckedCount,
					purchasedCount,
					items: displayItems,
				};
			})()
		: null;

	const manifestPreview = manifestPreviewRaw
		? {
				...manifestPreviewRaw,
				entries: manifestPreviewRaw.entries.slice(0, MOBILE_MANIFEST_ENTRY_CAP),
			}
		: null;

	const flightRecorderActivity =
		flightRecorderVisible && flightRecorderStats
			? {
					stats: flightRecorderStats,
					recent: flightRecorderRecent.map((event) => ({
						...event,
						occurredAt:
							event.occurredAt instanceof Date
								? event.occurredAt.toISOString()
								: String(event.occurredAt),
					})),
				}
			: null;

	return validateMobileHubResponse({
		expiringItems,
		cargoStats,
		latestSupplyList,
		manifestPreview,
		expirationAlertDays,
		hubProfile,
		hubLayout,
		availableMealTags,
		availableCargoTags,
		cargoTagIndex,
		mealMatches,
		partialMealMatches,
		snackMatches,
		flightRecorderActivity,
		nutritionToday: nutritionPayload.nutritionToday,
		nutritionTrends: nutritionPayload.nutritionTrends,
	});
}
