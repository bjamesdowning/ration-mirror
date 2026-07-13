import { getUserSettings } from "../auth.server";
import {
	getCargoStats,
	getExpiredCargo,
	getExpiringCargo,
} from "../cargo.server";
import { getManifestPreview } from "../manifest.server";
import { addDays, getTodayISO } from "../manifest-dates";
import { mapExpiryCargoItems } from "../mcp/expiry-map";
import { getSupplyItemStats, getSupplyList } from "../supply.server";
import { getAgentKitchenSnapshot } from "./kitchen-snapshot.server";
import { buildAgentTemporalContext } from "./temporal-context.server";

export const KITCHEN_SUMMARY_EXPIRING_LIMIT = 10;
export const KITCHEN_SUMMARY_EXPIRED_LIMIT = 10;
export const KITCHEN_SUMMARY_SUPPLY_LIMIT = 10;
export const KITCHEN_SUMMARY_MANIFEST_DAYS_MIN = 1;
export const KITCHEN_SUMMARY_MANIFEST_DAYS_MAX = 7;
export const KITCHEN_SUMMARY_EXPIRED_LOOKBACK_DAYS = 30;

export async function buildKitchenSummary(
	env: Cloudflare.Env,
	organizationId: string,
	userId: string,
	options?: { manifestDays?: number },
) {
	const db = env.DB;
	const now = new Date();
	const settings = await getUserSettings(db, userId);
	const expirationAlertDays = settings.expirationAlertDays ?? 7;
	const manifestDays = Math.min(
		Math.max(
			options?.manifestDays ?? KITCHEN_SUMMARY_MANIFEST_DAYS_MIN,
			KITCHEN_SUMMARY_MANIFEST_DAYS_MIN,
		),
		KITCHEN_SUMMARY_MANIFEST_DAYS_MAX,
	);
	const today = getTodayISO();

	const [
		kitchen,
		expiringRaw,
		expiredRaw,
		cargoStats,
		supplyList,
		manifestPreview,
	] = await Promise.all([
		getAgentKitchenSnapshot(env, organizationId),
		getExpiringCargo(
			db,
			organizationId,
			expirationAlertDays,
			KITCHEN_SUMMARY_EXPIRING_LIMIT,
			undefined,
			now,
		),
		getExpiredCargo(
			db,
			organizationId,
			KITCHEN_SUMMARY_EXPIRED_LOOKBACK_DAYS,
			KITCHEN_SUMMARY_EXPIRED_LIMIT,
			undefined,
			now,
		),
		getCargoStats(db, organizationId, now),
		getSupplyList(db, organizationId, { limit: KITCHEN_SUMMARY_SUPPLY_LIMIT }),
		getManifestPreview(db, organizationId, manifestDays),
	]);

	const supplyStats = supplyList
		? await getSupplyItemStats(db, supplyList.id)
		: null;

	const temporal = {
		...buildAgentTemporalContext(now),
		expirationAlertDays,
	};

	const manifestEntries = (manifestPreview?.entries ?? []).map((entry) => ({
		id: entry.entryId,
		date: entry.date,
		slotType: entry.slotType,
		mealId: entry.mealId,
		mealName: entry.mealName,
		servings: entry.servingsOverride ?? null,
	}));

	return {
		temporal,
		kitchen,
		cargo: {
			stats: cargoStats,
			expiringSoon: mapExpiryCargoItems(expiringRaw, now),
			expiredRecently: mapExpiryCargoItems(expiredRaw, now),
		},
		mealPlan: {
			planId: manifestPreview?.planId ?? null,
			startDate: today,
			endDate: addDays(today, manifestDays - 1),
			entries: manifestEntries,
		},
		supply: supplyList
			? {
					listId: supplyList.id,
					name: supplyList.name,
					itemCount: supplyStats?.itemCount ?? supplyList.items.length,
					purchasedCount: supplyStats?.purchasedCount ?? 0,
					uncheckedCount:
						(supplyStats?.itemCount ?? supplyList.items.length) -
						(supplyStats?.purchasedCount ?? 0),
					preview: supplyList.items
						.slice(0, KITCHEN_SUMMARY_SUPPLY_LIMIT)
						.map((item) => ({
							id: item.id,
							name: item.name,
							quantity: item.quantity,
							unit: item.unit,
							isPurchased: item.isPurchased,
						})),
				}
			: null,
	};
}
