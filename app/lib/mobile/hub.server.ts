import { resolveLayout } from "~/components/hub/widgets/registry";
import { getUserSettings } from "~/lib/auth.server";
import { getCargoStats, getExpiringCargo } from "~/lib/cargo.server";
import { getDistinctMealTags, getManifestPreview } from "~/lib/manifest.server";
import { MEAL_MATCH_CANDIDATE_CAP, matchMeals } from "~/lib/matching.server";
import {
	filterSupplyItemsByCargoTags,
	getSupplyItemStats,
	getSupplyList,
} from "~/lib/supply.server";
import { getCargoTagIndex, getOrganizationTags } from "~/lib/tags.server";

/**
 * @deprecated Use `MEAL_MATCH_CANDIDATE_CAP` — kept as an alias so older
 * imports keep compiling during the P1-A rollout.
 */
export const MOBILE_PRE_LIMIT = MEAL_MATCH_CANDIDATE_CAP;
const MOBILE_MAX_WIDGET_LIMIT = 20;
const MOBILE_MANIFEST_ENTRY_CAP = 50;
const MOBILE_SUPPLY_ITEMS_SLICE = 20;

function clampWidgetLimit(value: number | undefined, fallback: number): number {
	const base = value ?? fallback;
	return Math.min(Math.max(base, 1), MOBILE_MAX_WIDGET_LIMIT);
}

export async function getMobileHubData(
	env: Cloudflare.Env,
	organizationId: string,
	userId: string,
) {
	const db = env.DB;
	const settings = await getUserSettings(db, userId);
	const expirationAlertDays = settings.expirationAlertDays ?? 7;
	const hubProfile = settings.hubProfile;
	const hubLayout = settings.hubLayout;

	const resolvedWidgets = resolveLayout(hubProfile, hubLayout);
	const findWidget = (id: string) => resolvedWidgets.find((w) => w.id === id);

	const mealsReadyConfig = findWidget("meals-ready");
	const mealsPartialConfig = findWidget("meals-partial");
	const snacksReadyConfig = findWidget("snacks-ready");
	const cargoExpiringConfig = findWidget("cargo-expiring");
	const manifestPreviewConfig = findWidget("manifest-preview");
	const supplyPreviewConfig = findWidget("supply-preview");

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

	const [
		expiringItems,
		cargoStats,
		latestSupplyListRaw,
		manifestPreviewRaw,
		availableMealTags,
		availableCargoTags,
		cargoTagIndex,
		mealMatches,
		partialMealMatches,
		snackMatches,
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
		getDistinctMealTags(db, organizationId),
		getOrganizationTags(db, organizationId),
		getCargoTagIndex(db, organizationId),
		matchMeals(env, organizationId, {
			mode: "delta",
			minMatch: 50,
			limit: mealsReadyLimit,
			preLimit: MOBILE_PRE_LIMIT,
			type: "recipe",
			domain: "food",
			tags: mealsReadyConfig?.filters?.tags,
		}),
		matchMeals(env, organizationId, {
			mode: "delta",
			minMatch: 50,
			limit: mealsPartialLimit,
			preLimit: MOBILE_PRE_LIMIT,
			type: "recipe",
			domain: "food",
			tags: mealsPartialConfig?.filters?.tags,
		}),
		matchMeals(env, organizationId, {
			mode: "delta",
			minMatch: 50,
			limit: snacksReadyLimit,
			preLimit: MOBILE_PRE_LIMIT,
			type: "provision",
			domain: "food",
			tags: snacksReadyConfig?.filters?.tags,
		}),
	]);

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

	return {
		expiringItems,
		cargoStats,
		latestSupplyList,
		manifestPreview,
		expirationAlertDays,
		hubProfile,
		hubLayout,
		availableMealTags,
		availableCargoTags: availableCargoTags.map((t) => t.slug).sort(),
		cargoTagIndex,
		mealMatches,
		partialMealMatches,
		snackMatches,
	};
}
