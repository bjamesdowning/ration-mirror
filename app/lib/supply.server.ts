import { and, desc, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	activeMealSelection,
	cargo,
	meal,
	mealIngredient,
	member,
	supplyItem,
	supplyList,
	supplySnooze,
	user,
} from "../db/schema";
import { dockSupplyItems } from "./cargo.server";
import { toExpiryDate } from "./date-utils";
import { lookupDensity } from "./ingredient-density";
import { log } from "./logging.server";
import { getManifestWeekMealsForSupply } from "./manifest.server";
import { normalizeForMatch } from "./matching.server";
import {
	chunkArray,
	chunkedInsert,
	D1_MAX_BOUND_PARAMS,
} from "./query-utils.server";
import { getScaleFactor, scaleQuantity } from "./scale.server";
import {
	emitSupplySyncError,
	emitSupplySyncInfo,
	type SupplySyncTelemetryContext,
} from "./telemetry.server";
import { TIER_LIMITS } from "./tiers.server";
import {
	type BaseUnit,
	chooseReadableUnit,
	convertQuantity,
	convertQuantityWithDensity,
	getUnitMultiplier,
	normalizeToBaseUnit,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";
import {
	findSimilarCargo,
	findSimilarCargoBatch,
	SIMILARITY_THRESHOLDS,
	type SimilarCargoMatch,
} from "./vector.server";

const SHARE_TOKEN_EXPIRY_DAYS = 7;
const SHARE_TOKEN_EXPIRY_SECONDS = SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
const SUPPLY_LIST_NAME = "Supply";
/** supply_item insert: id, listId, name, quantity, unit, domain, isPurchased, sourceMealId, createdAt = 9 params/row */
const D1_MAX_SUPPLY_ROWS_PER_STATEMENT = Math.floor(D1_MAX_BOUND_PARAMS / 9);

async function getGroupSupplyListCapacity(
	d1: ReturnType<typeof drizzle>,
	organizationId: string,
) {
	const [ownerRow] = await d1
		.select({
			tier: user.tier,
			tierExpiresAt: user.tierExpiresAt,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(
			and(eq(member.organizationId, organizationId), eq(member.role, "owner")),
		);

	// Fallback to free limits if owner lookup fails.
	if (!ownerRow) return TIER_LIMITS.free.maxGroceryLists;

	const now = Date.now();
	const expiresAt = toExpiryDate(ownerRow.tierExpiresAt);
	const isExpired =
		ownerRow.tier === "crew_member" && expiresAt && expiresAt.getTime() <= now;
	const effectiveTier =
		ownerRow.tier === "crew_member" && !isExpired ? "crew_member" : "free";

	return TIER_LIMITS[effectiveTier].maxGroceryLists;
}

export interface SupplyItemInput {
	name: string;
	quantity?: number;
	unit?: string;
	domain?: string;
	sourceMealId?: string;
	sourceMealIds?: string[];
}

export interface SupplyListInput {
	name?: string;
}

export type SupplyItemWithSource = typeof supplyItem.$inferSelect & {
	sourceMealName: string | null;
	sourceMealNames: string[];
	sourceMealSources: { id: string; name: string }[];
};

export interface GenerationSummary {
	addedItems: number;
	skippedItems: number;
	mealsProcessed: number;
	totalIngredients: number;
}

type IngredientRow = {
	meal_ingredient: {
		ingredientName: string;
		quantity: number;
		unit: string;
		mealId: string;
	};
	meal_domain: string | null;
};

type AggregatedIngredient = {
	name: string;
	normalizedName: string;
	quantity: number;
	unit: SupportedUnit;
	domain: string;
	sourceMealIds: string[];
};

function convertCargoToTarget(
	quantity: number,
	fromUnit: SupportedUnit,
	targetUnit: SupportedUnit,
	ingredientName: string,
): number | null {
	const converted = convertQuantity(quantity, fromUnit, targetUnit);
	if (converted !== null) return converted;

	// Fallback: cross-family conversion using ingredient density (e.g. g → cup for flour)
	const density = lookupDensity(ingredientName);
	if (!density) return null;
	return convertQuantityWithDensity(quantity, fromUnit, targetUnit, density);
}

/**
 * Returns available quantity of `name` in `targetUnit` from `orgCargo`.
 *
 * First tries exact normalized-name match. If that yields nothing, falls back
 * to Vectorize semantic search. The `prefetchedVectors` map is an optional
 * pre-computed batch result (Map<ingredientName, SimilarCargoMatch[]>) that
 * avoids per-ingredient Vectorize API calls when processing a loop — pass it
 * from a `findSimilarCargoBatch()` call made before the loop. When absent the
 * function falls back to the individual `findSimilarCargo()` call.
 */
async function getAvailableCargoQuantity(
	env: Env,
	organizationId: string,
	name: string,
	targetUnit: SupportedUnit,
	orgCargo: (typeof cargo.$inferSelect)[],
	prefetchedVectors?: Map<string, SimilarCargoMatch[]>,
): Promise<number> {
	const normalizedName = normalizeForMatch(name);
	let exactTotal = 0;

	for (const item of orgCargo) {
		const normalizedItem = normalizeForMatch(item.name);
		if (normalizedItem !== normalizedName) continue;

		const itemUnit = toSupportedUnit(item.unit);
		const converted = convertCargoToTarget(
			item.quantity,
			itemUnit,
			targetUnit,
			name,
		);
		if (converted !== null) exactTotal += converted;
	}

	if (exactTotal > 0) return exactTotal;

	// Use pre-fetched batch result when available; otherwise fall back to a
	// single Vectorize query (original behaviour, used by non-loop callers).
	const similar = prefetchedVectors
		? (prefetchedVectors.get(name) ?? [])
		: await findSimilarCargo(env, organizationId, name, {
				topK: 1,
				threshold: SIMILARITY_THRESHOLDS.SUPPLY_MATCH,
			});

	if (similar.length === 0) return 0;

	const matchedName = normalizeForMatch(similar[0].itemName);
	for (const item of orgCargo) {
		if (normalizeForMatch(item.name) !== matchedName) continue;
		const itemUnit = toSupportedUnit(item.unit);
		const converted = convertCargoToTarget(
			item.quantity,
			itemUnit,
			targetUnit,
			name,
		);
		if (converted !== null) return converted;
	}
	return 0;
}

function getExistingListQuantity(
	items: (typeof supplyItem.$inferSelect)[],
	normalizedName: string,
	targetUnit: SupportedUnit,
	domain: string,
	ingredientName?: string,
): number {
	let total = 0;
	for (const item of items) {
		if ((item.domain ?? "food") !== domain) continue;
		// Defensive guard for legacy/corrupt rows so sync never crashes.
		if (typeof item.name !== "string" || item.name.length === 0) continue;
		if (normalizeForMatch(item.name) !== normalizedName) continue;

		const itemUnit = toSupportedUnit(item.unit);
		const multiplier = getUnitMultiplier(itemUnit, targetUnit);
		let converted: number | null =
			multiplier !== null ? item.quantity * multiplier : null;
		if (converted === null && ingredientName) {
			const density = lookupDensity(ingredientName);
			if (density) {
				converted = convertQuantityWithDensity(
					item.quantity,
					itemUnit,
					targetUnit,
					density,
				);
			}
		}
		if (converted !== null) total += converted;
	}

	return total;
}

function aggregateIngredients(rows: IngredientRow[]): AggregatedIngredient[] {
	const aggregation = new Map<
		string,
		{
			name: string;
			normalizedName: string;
			baseQuantity: number;
			baseUnit: BaseUnit;
			domain: string;
			sourceMealIds: Set<string>;
		}
	>();

	for (const row of rows) {
		const ingredient = row.meal_ingredient;
		const domain = row.meal_domain ?? "food";
		const normalizedName = normalizeForMatch(ingredient.ingredientName);
		const rawUnit = ingredient.unit ?? "";
		const safeUnit = toSupportedUnit(rawUnit);
		if (String(rawUnit).trim().toLowerCase() !== safeUnit) {
			log.warn("[Supply] Unsupported ingredient unit, using count", {
				rawUnit: String(rawUnit),
				safeUnit,
				ingredientName: ingredient.ingredientName,
			});
		}
		const normalized = normalizeToBaseUnit(ingredient.quantity, safeUnit);
		const key = `${normalizedName}__${domain}__${normalized.unit}`;

		const existing = aggregation.get(key);
		if (existing) {
			existing.baseQuantity += normalized.quantity;
			existing.sourceMealIds.add(ingredient.mealId);
			continue;
		}

		aggregation.set(key, {
			name: ingredient.ingredientName,
			normalizedName,
			baseQuantity: normalized.quantity,
			baseUnit: normalized.unit,
			domain,
			sourceMealIds: new Set([ingredient.mealId]),
		});
	}

	return Array.from(aggregation.values()).map((entry) => {
		const readable = chooseReadableUnit(entry.baseQuantity, entry.baseUnit);
		return {
			name: entry.name,
			normalizedName: entry.normalizedName,
			quantity: readable.quantity,
			unit: readable.unit,
			domain: entry.domain,
			sourceMealIds: Array.from(entry.sourceMealIds),
		};
	});
}

/**
 * Ensures a single "Supply" list exists for the organization.
 * If multiple lists exist, it keeps the most recently updated one, renames it to "Supply",
 * and deletes the others (per user directive to destroy data if easier).
 * If no list exists, creates a new one named "Supply".
 */
export async function ensureSupplyList(db: D1Database, organizationId: string) {
	const d1 = drizzle(db);

	// Fast path (99%+ of calls): a correctly-named list already exists.
	// A single LIMIT 1 query avoids fetching all rows and never triggers writes.
	const [existing] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.organizationId, organizationId),
				eq(supplyList.name, SUPPLY_LIST_NAME),
			),
		)
		.orderBy(desc(supplyList.updatedAt))
		.limit(1);

	if (existing) {
		return getSupplyListById(db, organizationId, existing.id);
	}

	// Slow path: either no list exists, or the primary list has the wrong name.
	// Fetch all to find/rename/create and remove duplicates.
	const lists = await d1
		.select()
		.from(supplyList)
		.where(eq(supplyList.organizationId, organizationId))
		.orderBy(desc(supplyList.updatedAt));

	if (lists.length === 0) {
		return createSupplyList(db, organizationId, { name: SUPPLY_LIST_NAME });
	}

	const [primaryList, ...listsToDelete] = lists;

	if (primaryList.name !== SUPPLY_LIST_NAME) {
		await d1
			.update(supplyList)
			.set({ name: SUPPLY_LIST_NAME, updatedAt: new Date() })
			.where(eq(supplyList.id, primaryList.id));
		primaryList.name = SUPPLY_LIST_NAME;
	}

	if (listsToDelete.length > 0) {
		const idsToDelete = listsToDelete.map((l) => l.id);
		for (const deleteChunk of chunkArray(idsToDelete, D1_MAX_BOUND_PARAMS)) {
			await d1.delete(supplyList).where(inArray(supplyList.id, deleteChunk));
		}
	}

	return getSupplyListById(db, organizationId, primaryList.id);
}

/**
 * Retrieves the "Supply" list for an organization.
 * This is the main entry point for the UI.
 */
export async function getSupplyList(db: D1Database, organizationId: string) {
	return ensureSupplyList(db, organizationId);
}

/**
 * Retrieves a single supply list by ID with all its items.
 */
export async function getSupplyListById(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	const [lists, itemRows] = await d1.batch([
		d1
			.select()
			.from(supplyList)
			.where(
				and(
					eq(supplyList.id, listId),
					eq(supplyList.organizationId, organizationId),
				),
			),
		d1.select().from(supplyItem).where(eq(supplyItem.listId, listId)),
	]);

	const list = lists[0];
	if (!list) return null;

	// Avoid join-column ambiguity by enriching source meal names in a second pass.
	const sourceMealIds = Array.from(
		new Set(
			itemRows.flatMap((item) => {
				const many =
					Array.isArray(item.sourceMealIds) && item.sourceMealIds.length > 0
						? item.sourceMealIds
						: [];
				if (many.length > 0) return many;
				return item.sourceMealId ? [item.sourceMealId] : [];
			}),
		),
	);

	const mealNameById = new Map<string, string>();
	if (sourceMealIds.length > 0) {
		const sourceMeals = await d1
			.select({ id: meal.id, name: meal.name })
			.from(meal)
			.where(inArray(meal.id, sourceMealIds));
		for (const sourceMeal of sourceMeals) {
			mealNameById.set(sourceMeal.id, sourceMeal.name);
		}
	}

	const items: SupplyItemWithSource[] = itemRows.map((item) => {
		const sourceIds =
			Array.isArray(item.sourceMealIds) && item.sourceMealIds.length > 0
				? item.sourceMealIds
				: item.sourceMealId
					? [item.sourceMealId]
					: [];
		const sourceMealSources = sourceIds
			.map((id) => ({ id, name: mealNameById.get(id) }))
			.filter(
				(x): x is { id: string; name: string } => typeof x.name === "string",
			);
		const sourceMealNames = sourceMealSources.map((x) => x.name);
		return {
			...item,
			sourceMealIds: sourceIds,
			sourceMealName: sourceMealNames[0] ?? null,
			sourceMealNames,
			sourceMealSources,
		};
	});

	return {
		...list,
		items,
	};
}

/**
 * Retrieves a supply list by share token (public access - no organizationId verification).
 */
export async function getSupplyListByShareToken(
	db: D1Database,
	shareToken: string,
) {
	const d1 = drizzle(db);

	const [lists, items] = await d1.batch([
		d1.select().from(supplyList).where(eq(supplyList.shareToken, shareToken)),
		d1
			.select({
				id: supplyItem.id,
				name: supplyItem.name,
				quantity: supplyItem.quantity,
				unit: supplyItem.unit,
				domain: supplyItem.domain,
				isPurchased: supplyItem.isPurchased,
			})
			.from(supplyItem)
			.innerJoin(supplyList, eq(supplyItem.listId, supplyList.id))
			.where(eq(supplyList.shareToken, shareToken)),
	]);

	const list = lists[0];
	if (!list) return null;

	// Check if share token has expired
	if (list.shareExpiresAt && new Date(list.shareExpiresAt) < new Date()) {
		return null;
	}

	return {
		name: list.name,
		items,
	};
}

/**
 * Updates a shared grocery item's purchased status and optionally quantity/unit.
 * Public access - validates share token and expiry.
 */
export async function updateSharedItemPurchased(
	db: D1Database,
	shareToken: string,
	itemId: string,
	isPurchased: boolean,
	updates: { quantity?: number; unit?: string },
) {
	const d1 = drizzle(db);

	const [list] = await d1
		.select({
			id: supplyList.id,
			shareExpiresAt: supplyList.shareExpiresAt,
		})
		.from(supplyList)
		.where(eq(supplyList.shareToken, shareToken));

	if (!list) throw new Error("Shared list not found");

	if (list.shareExpiresAt && new Date(list.shareExpiresAt) < new Date()) {
		throw new Error("Share link has expired");
	}

	const [item] = await d1
		.select({ id: supplyItem.id })
		.from(supplyItem)
		.where(and(eq(supplyItem.id, itemId), eq(supplyItem.listId, list.id)));

	if (!item) throw new Error("Item not found");

	const setValues: Partial<typeof supplyItem.$inferInsert> = {
		isPurchased,
		...(updates.quantity !== undefined && { quantity: updates.quantity }),
		...(updates.unit !== undefined && { unit: updates.unit }),
	};

	await d1.update(supplyItem).set(setValues).where(eq(supplyItem.id, itemId));

	return {
		id: itemId,
		isPurchased,
		quantity: updates.quantity,
		unit: updates.unit,
	};
}

/**
 * Creates a new supply list for an organization.
 */
export async function createSupplyList(
	db: D1Database,
	organizationId: string,
	data?: SupplyListInput,
) {
	const d1 = drizzle(db);
	const listId = crypto.randomUUID();
	const maxSupplyLists = await getGroupSupplyListCapacity(d1, organizationId);

	if (maxSupplyLists !== -1) {
		const [countResult] = await d1
			.select({ count: sql<number>`count(*)` })
			.from(supplyList)
			.where(eq(supplyList.organizationId, organizationId));
		const currentCount = countResult?.count ?? 0;
		if (currentCount >= maxSupplyLists) {
			throw new Error(
				`capacity_exceeded:supplyLists:${currentCount}:${maxSupplyLists}`,
			);
		}
	}

	await d1.insert(supplyList).values({
		id: listId,
		organizationId,
		name: data?.name || "Shopping List",
	});

	return await getSupplyListById(db, organizationId, listId);
}

/**
 * Updates a supply list's metadata.
 */
export async function updateSupplyList(
	db: D1Database,
	organizationId: string,
	listId: string,
	data: SupplyListInput,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [existing] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		);

	if (!existing) throw new Error("Supply list not found or unauthorized");

	await d1
		.update(supplyList)
		.set({
			name: data.name || existing.name,
			updatedAt: new Date(),
		})
		.where(eq(supplyList.id, listId));

	return await getSupplyListById(db, organizationId, listId);
}

/**
 * Deletes a supply list and all its items (cascade).
 */
export async function deleteSupplyList(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	return await d1
		.delete(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		);
}

/**
 * Adds an item to a supply list.
 */
export async function addSupplyItem(
	db: D1Database,
	organizationId: string,
	listId: string,
	data: SupplyItemInput,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Supply list not found or unauthorized");

	const itemId = crypto.randomUUID();

	await d1.batch([
		d1.insert(supplyItem).values({
			id: itemId,
			listId,
			name: data.name,
			quantity: data.quantity || 1,
			unit: data.unit || "unit",
			domain: data.domain || "food",
			sourceMealId: data.sourceMealId,
			sourceMealIds:
				data.sourceMealIds && data.sourceMealIds.length > 0
					? data.sourceMealIds
					: data.sourceMealId
						? [data.sourceMealId]
						: [],
		}),
		d1
			.update(supplyList)
			.set({ updatedAt: new Date() })
			.where(eq(supplyList.id, listId)),
	]);

	const [item] = await d1
		.select()
		.from(supplyItem)
		.where(eq(supplyItem.id, itemId));

	return item;
}

/**
 * Updates a supply item.
 */
export async function updateSupplyItem(
	db: D1Database,
	organizationId: string,
	listId: string,
	itemId: string,
	data: Partial<SupplyItemInput & { isPurchased?: boolean }>,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Supply list not found or unauthorized");

	// Verify item belongs to list
	const [existing] = await d1
		.select()
		.from(supplyItem)
		.where(and(eq(supplyItem.id, itemId), eq(supplyItem.listId, listId)));

	if (!existing) throw new Error("Supply item not found");

	await d1.batch([
		d1
			.update(supplyItem)
			.set({
				name: data.name ?? existing.name,
				quantity: data.quantity ?? existing.quantity,
				unit: data.unit ?? existing.unit,
				domain: data.domain ?? existing.domain,
				isPurchased: data.isPurchased ?? existing.isPurchased,
			})
			.where(eq(supplyItem.id, itemId)),
		d1
			.update(supplyList)
			.set({ updatedAt: new Date() })
			.where(eq(supplyList.id, listId)),
	]);

	const [item] = await d1
		.select()
		.from(supplyItem)
		.where(eq(supplyItem.id, itemId));

	return item;
}

/**
 * Deletes a supply item.
 */
export async function deleteSupplyItem(
	db: D1Database,
	organizationId: string,
	listId: string,
	itemId: string,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Supply list not found or unauthorized");

	await d1.batch([
		d1
			.delete(supplyItem)
			.where(and(eq(supplyItem.id, itemId), eq(supplyItem.listId, listId))),
		d1
			.update(supplyList)
			.set({ updatedAt: new Date() })
			.where(eq(supplyList.id, listId)),
	]);

	return { deleted: true };
}

/** Duration in ms for snooze presets. */
const SNOOZE_DURATIONS_MS: Record<string, number> = {
	"24h": 24 * 60 * 60 * 1000,
	"3d": 3 * 24 * 60 * 60 * 1000,
	"1w": 7 * 24 * 60 * 60 * 1000,
};

/**
 * Snoozes a supply item so it won't be re-added during sync until the duration expires.
 * Meal-sourced items are identified by normalized name + domain.
 */
export async function snoozeSupplyItem(
	db: D1Database,
	organizationId: string,
	listId: string,
	itemId: string,
	duration: "24h" | "3d" | "1w",
) {
	const d1 = drizzle(db);
	const now = new Date();
	const snoozedUntil = new Date(now.getTime() + SNOOZE_DURATIONS_MS[duration]);

	const [list] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Supply list not found or unauthorized");

	const [existing] = await d1
		.select()
		.from(supplyItem)
		.where(and(eq(supplyItem.id, itemId), eq(supplyItem.listId, listId)));

	if (!existing) throw new Error("Supply item not found");

	const normalizedName = normalizeForMatch(existing.name);
	const domain = existing.domain ?? "food";

	await d1
		.insert(supplySnooze)
		.values({
			organizationId,
			normalizedName,
			domain,
			snoozedUntil,
		})
		.onConflictDoUpdate({
			target: [
				supplySnooze.organizationId,
				supplySnooze.normalizedName,
				supplySnooze.domain,
			],
			set: { snoozedUntil, createdAt: now },
		});

	await d1.batch([
		d1
			.delete(supplyItem)
			.where(and(eq(supplyItem.id, itemId), eq(supplyItem.listId, listId))),
		d1
			.update(supplyList)
			.set({ updatedAt: now })
			.where(eq(supplyList.id, listId)),
	]);

	return { snoozed: true, snoozedUntil };
}

export type ActiveSnooze = {
	id: string;
	normalizedName: string;
	domain: string;
	snoozedUntil: Date;
	createdAt: Date;
};

/**
 * Returns all active (non-expired) snoozes for the organization.
 * Ordered by snoozedUntil ascending.
 */
export async function getActiveSnoozes(
	db: D1Database,
	organizationId: string,
): Promise<ActiveSnooze[]> {
	const d1 = drizzle(db);
	const now = new Date();
	const rows = await d1
		.select({
			id: supplySnooze.id,
			normalizedName: supplySnooze.normalizedName,
			domain: supplySnooze.domain,
			snoozedUntil: supplySnooze.snoozedUntil,
			createdAt: supplySnooze.createdAt,
		})
		.from(supplySnooze)
		.where(
			and(
				eq(supplySnooze.organizationId, organizationId),
				gt(supplySnooze.snoozedUntil, now),
			),
		)
		.orderBy(supplySnooze.snoozedUntil);

	return rows as ActiveSnooze[];
}

/**
 * Unsnoozes (early expires) a supply item by deleting its snooze row.
 * The item will be re-added on the next sync.
 */
export async function unsnoozeSupplyItem(
	db: D1Database,
	organizationId: string,
	snoozeId: string,
) {
	const d1 = drizzle(db);
	await d1
		.delete(supplySnooze)
		.where(
			and(
				eq(supplySnooze.id, snoozeId),
				eq(supplySnooze.organizationId, organizationId),
			),
		);

	return { unsnoozed: true };
}

/**
 * Returns a Set of "normalizedName__domain" keys that are currently snoozed for the org.
 * Call once at sync start to avoid N queries.
 */
async function getActiveSnoozeKeys(
	d1: ReturnType<typeof drizzle>,
	organizationId: string,
): Promise<Set<string>> {
	const now = new Date();
	const rows = await d1
		.select({
			normalizedName: supplySnooze.normalizedName,
			domain: supplySnooze.domain,
		})
		.from(supplySnooze)
		.where(
			and(
				eq(supplySnooze.organizationId, organizationId),
				gt(supplySnooze.snoozedUntil, now),
			),
		);

	const keys = new Set<string>();
	for (const row of rows) {
		keys.add(`${row.normalizedName}__${row.domain}`);
	}

	// Prune expired snoozes
	await d1
		.delete(supplySnooze)
		.where(
			and(
				eq(supplySnooze.organizationId, organizationId),
				lte(supplySnooze.snoozedUntil, now),
			),
		);

	return keys;
}

/**
 * Generates a share token for a supply list.
 * Share tokens expire after 7 days.
 */
export async function generateShareToken(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [list] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Supply list not found or unauthorized");

	// Generate a URL-safe token
	const shareToken = crypto.randomUUID().replace(/-/g, "");
	const shareExpiresAt = new Date(
		Date.now() + SHARE_TOKEN_EXPIRY_SECONDS * 1000,
	);

	await d1
		.update(supplyList)
		.set({
			shareToken,
			shareExpiresAt,
			updatedAt: new Date(),
		})
		.where(eq(supplyList.id, listId));

	return {
		shareToken,
		shareExpiresAt,
	};
}

/**
 * Revokes the share token for a supply list.
 */
export async function revokeShareToken(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [list] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Supply list not found or unauthorized");

	await d1
		.update(supplyList)
		.set({
			shareToken: null,
			shareExpiresAt: null,
			updatedAt: new Date(),
		})
		.where(eq(supplyList.id, listId));

	return { revoked: true };
}

/**
 * Adds missing ingredients from a meal to a supply list.
 * This performs cargo matching to only add items the organization doesn't have.
 * When options.servings is provided, ingredient quantities are scaled accordingly.
 */
export async function addItemsFromMeal(
	env: Env,
	organizationId: string,
	listId: string,
	mealId: string,
	options?: { servings?: number },
) {
	const d1 = drizzle(env.DB);

	// Fetch list, ingredients, and meal record in parallel to avoid 3 sequential round-trips.
	const [[list], ingredients, [mealRecord]] = await Promise.all([
		d1
			.select()
			.from(supplyList)
			.where(
				and(
					eq(supplyList.id, listId),
					eq(supplyList.organizationId, organizationId),
				),
			),
		d1.select().from(mealIngredient).where(eq(mealIngredient.mealId, mealId)),
		d1
			.select({ domain: meal.domain, servings: meal.servings })
			.from(meal)
			.where(eq(meal.id, mealId)),
	]);

	if (!list) throw new Error("Supply list not found or unauthorized");

	const mealDomain = mealRecord?.domain ?? "food";
	const mealBaseServings = mealRecord?.servings ?? 1;

	// Resolve effective servings: explicit option → selection override → base
	let effectiveServings = mealBaseServings;
	if (options?.servings != null) {
		effectiveServings = options.servings;
	} else {
		const [selection] = await d1
			.select({ servingsOverride: activeMealSelection.servingsOverride })
			.from(activeMealSelection)
			.where(
				and(
					eq(activeMealSelection.organizationId, organizationId),
					eq(activeMealSelection.mealId, mealId),
				),
			);
		if (selection?.servingsOverride != null) {
			effectiveServings = selection.servingsOverride;
		}
	}

	const scaleFactor = getScaleFactor(mealBaseServings, effectiveServings);

	if (ingredients.length === 0) {
		return { addedItems: [], skippedItems: [] };
	}

	// Get organization's current cargo and existing list items in parallel
	const [orgCargo, existingListItems] = await Promise.all([
		d1.select().from(cargo).where(eq(cargo.organizationId, organizationId)),
		d1.select().from(supplyItem).where(eq(supplyItem.listId, listId)),
	]);

	// Pre-fetch all Vectorize results in one batch instead of one call per ingredient
	const ingredientNames = ingredients.map((i) => i.ingredientName);
	const prefetchedVectors = await findSimilarCargoBatch(
		env,
		organizationId,
		ingredientNames,
		{ topK: 1, threshold: SIMILARITY_THRESHOLDS.SUPPLY_MATCH },
	);

	const addedItems: (typeof supplyItem.$inferSelect)[] = [];
	const skippedItems: { name: string; reason: string }[] = [];

	// Check each ingredient against inventory
	for (const ingredient of ingredients) {
		const targetUnit = ingredient.unit as SupportedUnit;
		const normalizedName = normalizeForMatch(ingredient.ingredientName);
		const scaledRequired = scaleQuantity(
			ingredient.quantity,
			scaleFactor,
			ingredient.unit,
		);
		const availableInCargo = await getAvailableCargoQuantity(
			env,
			organizationId,
			ingredient.ingredientName,
			targetUnit,
			orgCargo,
			prefetchedVectors,
		);

		if (availableInCargo >= scaledRequired) {
			// Organization has enough of this item
			skippedItems.push({
				name: ingredient.ingredientName,
				reason: "Sufficient quantity in Cargo",
			});
			continue;
		}

		const neededQuantity = scaledRequired - availableInCargo;
		const alreadyInList = getExistingListQuantity(
			existingListItems,
			normalizedName,
			targetUnit,
			mealDomain,
			ingredient.ingredientName,
		);
		const remainingToAdd = Math.max(0, neededQuantity - alreadyInList);

		if (remainingToAdd <= 0) {
			skippedItems.push({
				name: ingredient.ingredientName,
				reason: "Already present in list",
			});
			continue;
		}

		const mergeTarget = existingListItems.find((item) => {
			if ((item.domain ?? "food") !== mealDomain) return false;
			if (normalizeForMatch(item.name) !== normalizedName) return false;
			return getUnitMultiplier(targetUnit, item.unit as SupportedUnit) !== null;
		});

		if (mergeTarget) {
			const delta = convertQuantity(
				remainingToAdd,
				targetUnit,
				mergeTarget.unit as SupportedUnit,
			);
			if (delta !== null) {
				await d1
					.update(supplyItem)
					.set({ quantity: mergeTarget.quantity + delta })
					.where(eq(supplyItem.id, mergeTarget.id));

				mergeTarget.quantity += delta;
				addedItems.push(mergeTarget);
				continue;
			}
		}

		const itemId = crypto.randomUUID();
		const newItemPayload = {
			id: itemId,
			listId,
			name: ingredient.ingredientName,
			quantity: remainingToAdd,
			unit: ingredient.unit,
			domain: mealDomain,
			sourceMealId: mealId,
			sourceMealIds: [mealId],
		} satisfies typeof supplyItem.$inferInsert;

		await d1.insert(supplyItem).values(newItemPayload);
		const [newItem] = await d1
			.select()
			.from(supplyItem)
			.where(eq(supplyItem.id, itemId));
		addedItems.push(newItem);
		existingListItems.push(newItem);
	}

	// Update list timestamp
	await d1
		.update(supplyList)
		.set({ updatedAt: new Date() })
		.where(eq(supplyList.id, listId));

	return { addedItems, skippedItems };
}

/**
 * Creates a supply list from ALL organization meals with missing ingredients.
 * Aggregates ingredients across meals and deduplicates by name.
 * Only adds items that are missing or insufficient in inventory.
 */
export async function createSupplyListFromAllMeals(
	env: Env,
	organizationId: string,
	_listName?: string,
): Promise<{
	list: ReturnType<typeof getSupplyListById> extends Promise<infer T>
		? T
		: never;
	summary: GenerationSummary;
}> {
	const d1 = drizzle(env.DB);

	// Get all organization meals
	const meals = await d1
		.select({ id: meal.id })
		.from(meal)
		.where(eq(meal.organizationId, organizationId));

	if (meals.length === 0) {
		const list = await ensureSupplyList(env.DB, organizationId);
		if (!list) throw new Error("Failed to ensure supply list");
		return {
			list,
			summary: {
				addedItems: 0,
				skippedItems: 0,
				mealsProcessed: 0,
				totalIngredients: 0,
			},
		};
	}

	// Get all ingredients from all meals
	const allIngredients = await d1
		.select({
			meal_ingredient: {
				ingredientName: mealIngredient.ingredientName,
				quantity: mealIngredient.quantity,
				unit: mealIngredient.unit,
				mealId: mealIngredient.mealId,
			},
			meal_domain: meal.domain,
		})
		.from(mealIngredient)
		.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
		.where(eq(meal.organizationId, organizationId));

	if (allIngredients.length === 0) {
		const list = await ensureSupplyList(env.DB, organizationId);
		if (!list) throw new Error("Failed to ensure supply list");
		return {
			list,
			summary: {
				addedItems: 0,
				skippedItems: 0,
				mealsProcessed: meals.length,
				totalIngredients: 0,
			},
		};
	}

	return syncSupplyFromIngredientRows(
		env,
		organizationId,
		allIngredients,
		meals.length,
	);
}

/**
 * Builds IngredientRow[] for a flat list of { mealId, servingsOverride } occurrences.
 * Each occurrence is included independently so the same meal on multiple days sums correctly.
 */
async function buildIngredientRowsFromOccurrences(
	d1: ReturnType<typeof drizzle>,
	organizationId: string,
	occurrences: Array<{ mealId: string; servingsOverride: number | null }>,
): Promise<IngredientRow[]> {
	if (occurrences.length === 0) return [];

	const mealIds = [...new Set(occurrences.map((o) => o.mealId))];

	// Batch-load meal metadata and ingredients for all unique meal IDs
	const allMealIds = mealIds;
	const [mealRows, ingredientRows] = await Promise.all([
		d1
			.select({ id: meal.id, domain: meal.domain, servings: meal.servings })
			.from(meal)
			.where(
				and(
					eq(meal.organizationId, organizationId),
					inArray(meal.id, allMealIds),
				),
			),
		d1
			.select({
				mealId: mealIngredient.mealId,
				ingredientName: mealIngredient.ingredientName,
				quantity: mealIngredient.quantity,
				unit: mealIngredient.unit,
			})
			.from(mealIngredient)
			.where(inArray(mealIngredient.mealId, allMealIds)),
	]);

	const mealMeta = new Map(mealRows.map((m) => [m.id, m]));
	const ingredientsByMeal = new Map<string, typeof ingredientRows>();
	for (const row of ingredientRows) {
		const list = ingredientsByMeal.get(row.mealId) ?? [];
		list.push(row);
		ingredientsByMeal.set(row.mealId, list);
	}

	const result: IngredientRow[] = [];

	for (const occurrence of occurrences) {
		const meta = mealMeta.get(occurrence.mealId);
		if (!meta) continue;

		const baseServings = meta.servings ?? 1;
		const effectiveServings = occurrence.servingsOverride ?? baseServings;
		const scaleFactor = getScaleFactor(baseServings, effectiveServings);
		const domain = meta.domain ?? null;

		const ingredients = ingredientsByMeal.get(occurrence.mealId) ?? [];
		for (const ing of ingredients) {
			result.push({
				meal_ingredient: {
					ingredientName: ing.ingredientName,
					quantity: scaleQuantity(ing.quantity, scaleFactor, ing.unit),
					unit: ing.unit,
					mealId: ing.mealId,
				},
				meal_domain: domain,
			});
		}
	}

	return result;
}

/**
 * Creates/updates the Supply list from a UNIFIED list of:
 *   - All Manifest current-week entries (each occurrence counts)
 *   - Plus Galley selections whose mealId does NOT appear in the Manifest week
 *     (prevents double-counting when a user plans a meal AND marks it in Galley)
 *
 * If neither source has meals, returns the Supply list unchanged.
 */
export async function createSupplyListFromSelectedMeals(
	env: Env,
	organizationId: string,
	_listName?: string,
	telemetryContext?: SupplySyncTelemetryContext,
): Promise<{
	list: ReturnType<typeof getSupplyListById> extends Promise<infer T>
		? T
		: never;
	summary: GenerationSummary;
}> {
	const startedAtMs = Date.now();
	const d1 = drizzle(env.DB);
	const telemetry = telemetryContext
		? { ...telemetryContext, organizationId }
		: undefined;

	try {
		emitSupplySyncInfo(
			"supply_sync.create_selected.start",
			telemetry ?? {
				trigger: "dashboard_grocery_action_update_list",
				organizationId,
			},
		);

		const mealsQueryStartedAtMs = Date.now();

		// Step 1a: Get Manifest current-week occurrences (one row per plan entry)
		const manifestOccurrences = await getManifestWeekMealsForSupply(
			env.DB,
			organizationId,
		);

		// Step 1b: Get Galley selections
		const galleyRows = await d1
			.select({
				mealId: activeMealSelection.mealId,
				servingsOverride: activeMealSelection.servingsOverride,
			})
			.from(activeMealSelection)
			.where(eq(activeMealSelection.organizationId, organizationId));

		// Step 1c: Dedupe — exclude Galley selections already in Manifest
		const manifestMealIds = new Set(manifestOccurrences.map((m) => m.mealId));
		const galleySelections = galleyRows.filter(
			(g) => !manifestMealIds.has(g.mealId),
		);

		// Step 1d: Unified list (manifest occurrences + deduped galley)
		const unified: Array<{ mealId: string; servingsOverride: number | null }> =
			[...manifestOccurrences, ...galleySelections];

		const mealsQueryDurationMs = Date.now() - mealsQueryStartedAtMs;

		if (unified.length === 0) {
			const supplyList = await ensureSupplyList(env.DB, organizationId);
			if (!supplyList) throw new Error("Failed to ensure supply list");

			emitSupplySyncInfo(
				"supply_sync.create_selected.success",
				{
					...(telemetry ?? { trigger: "dashboard_grocery_action_update_list" }),
					listId: supplyList.id,
					organizationId,
				},
				{
					duration_ms: Date.now() - startedAtMs,
					meals_selected_count: 0,
					ingredient_rows_count: 0,
					meals_query_duration_ms: mealsQueryDurationMs,
				},
			);

			return {
				list: supplyList,
				summary: {
					addedItems: 0,
					skippedItems: 0,
					mealsProcessed: 0,
					totalIngredients: 0,
				},
			};
		}

		// Step 2: Build IngredientRow[] from the unified list
		const ingredientQueryStartedAtMs = Date.now();
		const allIngredients = await buildIngredientRowsFromOccurrences(
			d1,
			organizationId,
			unified,
		);
		const ingredientQueryDurationMs = Date.now() - ingredientQueryStartedAtMs;

		if (allIngredients.length === 0) {
			const supplyList = await ensureSupplyList(env.DB, organizationId);
			if (!supplyList) throw new Error("Failed to ensure supply list");

			emitSupplySyncInfo(
				"supply_sync.create_selected.success",
				{
					...(telemetry ?? { trigger: "dashboard_grocery_action_update_list" }),
					listId: supplyList.id,
					organizationId,
				},
				{
					duration_ms: Date.now() - startedAtMs,
					meals_selected_count: unified.length,
					ingredient_rows_count: 0,
					meals_query_duration_ms: mealsQueryDurationMs,
					ingredients_query_duration_ms: ingredientQueryDurationMs,
				},
			);

			return {
				list: supplyList,
				summary: {
					addedItems: 0,
					skippedItems: 0,
					mealsProcessed: unified.length,
					totalIngredients: 0,
				},
			};
		}

		// Step 3: Reuse existing sync path (unchanged)
		const syncResult = await syncSupplyFromIngredientRows(
			env,
			organizationId,
			allIngredients,
			unified.length,
			telemetry,
		);

		emitSupplySyncInfo(
			"supply_sync.create_selected.success",
			telemetry ?? {
				trigger: "dashboard_grocery_action_update_list",
				organizationId,
			},
			{
				duration_ms: Date.now() - startedAtMs,
				meals_selected_count: unified.length,
				ingredient_rows_count: allIngredients.length,
				meals_query_duration_ms: mealsQueryDurationMs,
				ingredients_query_duration_ms: ingredientQueryDurationMs,
				source: "manifest_and_selection",
				manifest_occurrence_count: manifestOccurrences.length,
				galley_selection_count: galleySelections.length,
			},
		);

		return syncResult;
	} catch (error) {
		emitSupplySyncError(
			"supply_sync.create_selected.error",
			telemetry ?? {
				trigger: "dashboard_grocery_action_update_list",
				organizationId,
			},
			error,
			{
				duration_ms: Date.now() - startedAtMs,
			},
		);
		throw error;
	}
}

async function syncSupplyFromIngredientRows(
	env: Env,
	organizationId: string,
	allIngredients: IngredientRow[],
	mealsProcessed: number,
	telemetryContext?: SupplySyncTelemetryContext,
): Promise<{
	list: ReturnType<typeof getSupplyListById> extends Promise<infer T>
		? T
		: never;
	summary: GenerationSummary;
}> {
	const startedAtMs = Date.now();
	const d1 = drizzle(env.DB);
	try {
		emitSupplySyncInfo(
			"supply_sync.materialize.start",
			telemetryContext ?? {
				trigger: "dashboard_grocery_action_update_list",
				organizationId,
			},
			{
				meals_processed_count: mealsProcessed,
				ingredient_rows_count: allIngredients.length,
			},
		);

		const ensureListStartedAtMs = Date.now();
		const supplyListData = await ensureSupplyList(env.DB, organizationId);
		const ensureListDurationMs = Date.now() - ensureListStartedAtMs;

		if (!supplyListData) {
			throw new Error("Failed to ensure supply list");
		}

		const telemetryWithList = {
			...(telemetryContext ?? {
				trigger: "dashboard_grocery_action_update_list",
			}),
			organizationId,
			listId: supplyListData.id,
		};

		const clearStartedAtMs = Date.now();
		await d1
			.delete(supplyItem)
			.where(
				and(
					eq(supplyItem.listId, supplyListData.id),
					eq(supplyItem.isPurchased, false),
					isNotNull(supplyItem.sourceMealId),
				),
			);
		const clearDurationMs = Date.now() - clearStartedAtMs;

		const refreshListStartedAtMs = Date.now();
		const refreshedList = await getSupplyListById(
			env.DB,
			organizationId,
			supplyListData.id,
		);
		const refreshListDurationMs = Date.now() - refreshListStartedAtMs;
		if (!refreshedList) throw new Error("List retrieval failed");

		const inventoryFetchStartedAtMs = Date.now();
		const orgCargo = await d1
			.select()
			.from(cargo)
			.where(eq(cargo.organizationId, organizationId));
		const inventoryFetchDurationMs = Date.now() - inventoryFetchStartedAtMs;

		const aggregateStartedAtMs = Date.now();
		const aggregatedIngredients = aggregateIngredients(allIngredients);
		const aggregateDurationMs = Date.now() - aggregateStartedAtMs;
		const existingItems = refreshedList.items ?? [];

		const snoozeKeys = await getActiveSnoozeKeys(d1, organizationId);

		// Pre-fetch all Vectorize similarity results in one batch call before
		// entering the per-ingredient loop. This replaces N sequential
		// Vectorize lookups (one per aggregated ingredient) with a single
		// batched embedding request + parallel Vectorize queries.
		const aggregatedNames = aggregatedIngredients.map((a) => a.name);
		const prefetchedVectors = await findSimilarCargoBatch(
			env,
			organizationId,
			aggregatedNames,
			{ topK: 1, threshold: SIMILARITY_THRESHOLDS.SUPPLY_MATCH },
		);

		let addedCount = 0;
		let skippedCount = 0;
		const itemsToInsert: (typeof supplyItem.$inferInsert)[] = [];

		for (const aggregated of aggregatedIngredients) {
			const snoozeKey = `${aggregated.normalizedName}__${aggregated.domain}`;
			if (snoozeKeys.has(snoozeKey)) {
				skippedCount++;
				continue;
			}

			const availableInCargo = await getAvailableCargoQuantity(
				env,
				organizationId,
				aggregated.name,
				aggregated.unit,
				orgCargo,
				prefetchedVectors,
			);
			const missingAfterCargo = Math.max(
				0,
				aggregated.quantity - availableInCargo,
			);

			if (missingAfterCargo <= 0) {
				skippedCount++;
				continue;
			}

			const existingQuantityInList = getExistingListQuantity(
				existingItems,
				aggregated.normalizedName,
				aggregated.unit,
				aggregated.domain,
				aggregated.name,
			);
			const remainingNeeded = Math.max(
				0,
				missingAfterCargo - existingQuantityInList,
			);

			if (remainingNeeded <= 0) {
				skippedCount++;
				continue;
			}

			itemsToInsert.push({
				id: crypto.randomUUID(),
				listId: supplyListData.id,
				name: aggregated.name,
				quantity: remainingNeeded,
				unit: aggregated.unit,
				domain: aggregated.domain,
				sourceMealId: aggregated.sourceMealIds[0],
				sourceMealIds: aggregated.sourceMealIds,
			});
			addedCount++;
		}

		const insertChunkCount = Math.ceil(
			itemsToInsert.length / D1_MAX_SUPPLY_ROWS_PER_STATEMENT,
		);
		const insertStartedAtMs = Date.now();
		if (itemsToInsert.length > 0) {
			await chunkedInsert(
				itemsToInsert,
				D1_MAX_SUPPLY_ROWS_PER_STATEMENT,
				(insertChunk) => d1.insert(supplyItem).values(insertChunk),
			);

			await d1
				.update(supplyList)
				.set({ updatedAt: new Date() })
				.where(eq(supplyList.id, supplyListData.id));
		}
		const insertDurationMs = Date.now() - insertStartedAtMs;

		const finalListFetchStartedAtMs = Date.now();
		const list = await getSupplyListById(
			env.DB,
			organizationId,
			supplyListData.id,
		);
		const finalListFetchDurationMs = Date.now() - finalListFetchStartedAtMs;
		if (!list) throw new Error("List retrieval failed");

		emitSupplySyncInfo("supply_sync.materialize.success", telemetryWithList, {
			duration_ms: Date.now() - startedAtMs,
			meals_processed_count: mealsProcessed,
			ingredient_rows_count: allIngredients.length,
			aggregated_ingredients_count: aggregatedIngredients.length,
			insert_candidate_rows_count: itemsToInsert.length,
			insert_chunk_count: insertChunkCount,
			insert_rows_per_statement: D1_MAX_SUPPLY_ROWS_PER_STATEMENT,
			added_items_count: addedCount,
			skipped_items_count: skippedCount,
			ensure_list_duration_ms: ensureListDurationMs,
			clear_generated_items_duration_ms: clearDurationMs,
			refresh_list_duration_ms: refreshListDurationMs,
			inventory_fetch_duration_ms: inventoryFetchDurationMs,
			aggregate_duration_ms: aggregateDurationMs,
			insert_duration_ms: insertDurationMs,
			final_list_fetch_duration_ms: finalListFetchDurationMs,
		});

		return {
			list,
			summary: {
				addedItems: addedCount,
				skippedItems: skippedCount,
				mealsProcessed,
				totalIngredients: allIngredients.length,
			},
		};
	} catch (error) {
		emitSupplySyncError(
			"supply_sync.materialize.error",
			telemetryContext ?? {
				trigger: "dashboard_grocery_action_update_list",
				organizationId,
			},
			error,
			{
				duration_ms: Date.now() - startedAtMs,
				meals_processed_count: mealsProcessed,
				ingredient_rows_count: allIngredients.length,
			},
		);
		throw error;
	}
}

/**
 * Docks all purchased items from the list into cargo and removes them from the list.
 */
export async function completeSupplyList(
	env: Env,
	organizationId: string,
	listId: string,
) {
	const d1 = drizzle(env.DB);

	// 1. Get purchased items
	const purchasedItems = await d1
		.select()
		.from(supplyItem)
		.where(
			and(eq(supplyItem.listId, listId), eq(supplyItem.isPurchased, true)),
		);

	if (purchasedItems.length === 0) {
		return {
			docked: 0,
			created: 0,
			message: "No purchased items to dock",
		};
	}

	// 2. Dock them
	const results = await dockSupplyItems(env, organizationId, purchasedItems);

	// 3. Remove them from the list (cleanup)
	for (const deleteChunk of chunkArray(purchasedItems, D1_MAX_BOUND_PARAMS)) {
		const deleteOps = deleteChunk.map((item) =>
			d1.delete(supplyItem).where(eq(supplyItem.id, item.id)),
		);
		const [firstDelete, ...remainingDeletes] = deleteOps;

		if (!firstDelete) continue;
		await d1.batch([firstDelete, ...remainingDeletes]);
	}

	return {
		docked: results.updated + results.created,
		summary: results,
	};
}
