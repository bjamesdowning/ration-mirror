import { and, desc, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	activeMealSelection,
	cargo,
	ledger,
	meal,
	mealIngredient,
	member,
	supplyItem,
	supplyList,
	supplySnooze,
	user,
} from "../db/schema";
import { computeBaseFields, effectiveBaseFields } from "./base-quantity";
import { dockSupplyItems, ingestCargoItems } from "./cargo.server";
import { type CargoIndexRow, fetchOrgCargoIndex } from "./cargo-index.server";
import { getActiveCargoSelections } from "./cargo-selection.server";
import { toExpiryDate } from "./date-utils";
import type { ITEM_DOMAINS } from "./domain";
import { log } from "./logging.server";
import { getManifestWeekMealsForSupply } from "./manifest.server";
import { normalizeForCargoDedup } from "./matching.server";
import {
	chunkArray,
	chunkedInsert,
	chunkedQuery,
	D1_MAX_BOUND_PARAMS,
} from "./query-utils.server";
import { getScaleFactor, scaleQuantity } from "./scale.server";
import {
	mergeSupplyOrigins,
	normalizeSupplyOrigins,
	type SupplyItemOrigin,
} from "./supply-item-origins";
import {
	emitSupplySyncError,
	emitSupplySyncInfo,
	type SupplySyncTelemetryContext,
} from "./telemetry.server";
import { TIER_LIMITS } from "./tiers.server";
import type { UnitDisplayMode } from "./unit-display-mode";
import {
	type BaseUnit,
	chooseReadableUnit,
	convertFromBaseUnit,
	convertIngredientAmount,
	convertQuantity,
	getUnitMultiplier,
	normalizeToBaseUnit,
	type SupportedUnit,
	toCookingUnit,
	toShoppingUnit,
	toSupportedUnit,
} from "./units";
import {
	findSimilarCargoBatch,
	SIMILARITY_THRESHOLDS,
	type SimilarCargoMatch,
} from "./vector.server";

const SHARE_TOKEN_EXPIRY_DAYS = 7;
const SHARE_TOKEN_EXPIRY_SECONDS = SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
const SUPPLY_LIST_NAME = "Supply";
/** supply_item insert: id, listId, name, quantity, unit, domain, sourceMealId, sourceMealIds, sourceOrigins, sourceCargoId = 10 params/row */
const D1_MAX_SUPPLY_ROWS_PER_STATEMENT = Math.floor(D1_MAX_BOUND_PARAMS / 10);

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
	sourceOrigins: SupplyItemOrigin[];
};

export interface GenerationSummary {
	addedItems: number;
	skippedItems: number;
	mealsProcessed: number;
	totalIngredients: number;
}

type MealSupplyOrigin = "manifest" | "galley";

type IngredientRow = {
	meal_ingredient: {
		ingredientName: string;
		quantity: number;
		unit: string;
		baseQuantity: number;
		baseUnit: string;
		mealId: string;
	};
	meal_domain: string | null;
	supplyOrigin: MealSupplyOrigin;
};

type AggregatedIngredient = {
	name: string;
	normalizedName: string;
	quantity: number;
	unit: SupportedUnit;
	baseQuantity: number;
	baseUnit: BaseUnit;
	domain: string;
	sourceMealIds: string[];
	sourceOrigins: SupplyItemOrigin[];
};

/**
 * Returns available quantity of `name` in `targetUnit` from `orgCargo`.
 *
 * Phase 1: exact normalizeForCargoDedup key match (handles regional synonyms
 * and prep words, e.g. "tinned tomatoes" === "canned tomatoes").
 * Phase 2: uses the pre-fetched `prefetchedVectors` batch result for semantic
 * fallback — callers must pre-fetch with findSimilarCargoBatch before the loop.
 */
function getAvailableCargoQuantity(
	name: string,
	targetUnit: SupportedUnit,
	orgCargo: CargoIndexRow[],
	prefetchedVectors: Map<string, SimilarCargoMatch[]>,
): number {
	const normalizedName = normalizeForCargoDedup(name);
	let exactTotal = 0;

	for (const item of orgCargo) {
		const normalizedItem = normalizeForCargoDedup(item.name);
		if (normalizedItem !== normalizedName) continue;

		const base = effectiveBaseFields(
			item.quantity,
			item.unit,
			item.baseQuantity ?? item.quantity,
			item.baseUnit ?? item.unit,
			name,
		);
		const itemUnit = toSupportedUnit(base.baseUnit);
		const converted = convertIngredientAmount(
			base.baseQuantity,
			itemUnit,
			targetUnit,
			name,
		);
		if (converted !== null) exactTotal += converted;
	}

	if (exactTotal > 0) return exactTotal;

	const similar = prefetchedVectors.get(name) ?? [];
	if (similar.length === 0) return 0;

	const matchedName = normalizeForCargoDedup(similar[0].itemName);
	for (const item of orgCargo) {
		if (normalizeForCargoDedup(item.name) !== matchedName) continue;
		const base = effectiveBaseFields(
			item.quantity,
			item.unit,
			item.baseQuantity ?? item.quantity,
			item.baseUnit ?? item.unit,
			name,
		);
		const itemUnit = toSupportedUnit(base.baseUnit);
		const converted = convertIngredientAmount(
			base.baseQuantity,
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
		if (normalizeForCargoDedup(item.name) !== normalizedName) continue;

		const base = effectiveBaseFields(
			item.quantity,
			item.unit,
			item.baseQuantity ?? item.quantity,
			item.baseUnit ?? item.unit,
			ingredientName ?? normalizedName,
		);
		const itemUnit = toSupportedUnit(base.baseUnit);
		const converted = convertIngredientAmount(
			base.baseQuantity,
			itemUnit,
			targetUnit,
			ingredientName ?? normalizedName,
		);
		if (converted !== null) total += converted;
	}

	return total;
}

function mergeIntoAggregation(
	existing: {
		name: string;
		normalizedName: string;
		baseQuantity: number;
		baseUnit: BaseUnit;
		domain: string;
		sourceMealIds: Set<string>;
		sourceOrigins: Set<SupplyItemOrigin>;
	},
	baseQuantity: number,
	baseUnit: BaseUnit,
	mealId: string,
	ingredientName: string,
	supplyOrigin: MealSupplyOrigin,
): boolean {
	if (baseUnit === existing.baseUnit) {
		existing.baseQuantity += baseQuantity;
		existing.sourceMealIds.add(mealId);
		existing.sourceOrigins.add(supplyOrigin);
		return true;
	}

	const targetUnit = baseUnitToSupported(existing.baseUnit);
	const existingInTarget = convertFromBaseUnit(
		existing.baseQuantity,
		existing.baseUnit,
		targetUnit,
	);
	if (existingInTarget === null) return false;

	const addedUnit = baseUnitToSupported(baseUnit);
	const added = convertIngredientAmount(
		baseQuantity,
		addedUnit,
		targetUnit,
		ingredientName,
	);
	if (added === null) return false;

	const merged = normalizeToBaseUnit(existingInTarget + added, targetUnit);
	existing.baseQuantity = merged.quantity;
	existing.baseUnit = merged.unit;
	existing.sourceMealIds.add(mealId);
	existing.sourceOrigins.add(supplyOrigin);
	return true;
}

function baseUnitToSupported(baseUnit: BaseUnit): SupportedUnit {
	switch (baseUnit) {
		case "g":
			return "g";
		case "ml":
			return "ml";
		case "oz":
			return "oz";
		default:
			return "unit";
	}
}

export function aggregateIngredients(
	rows: IngredientRow[],
	_unitMode: UnitDisplayMode = "metric",
): AggregatedIngredient[] {
	const aggregation = new Map<
		string,
		{
			name: string;
			normalizedName: string;
			baseQuantity: number;
			baseUnit: BaseUnit;
			domain: string;
			sourceMealIds: Set<string>;
			sourceOrigins: Set<SupplyItemOrigin>;
		}
	>();

	for (const row of rows) {
		const ingredient = row.meal_ingredient;
		const domain = row.meal_domain ?? "food";
		const normalizedName = normalizeForCargoDedup(ingredient.ingredientName);
		const rawUnit = ingredient.unit ?? "";
		const safeUnit = toSupportedUnit(rawUnit);
		if (String(rawUnit).trim().toLowerCase() !== safeUnit) {
			log.warn("[Supply] Unsupported ingredient unit, using count", {
				rawUnit: String(rawUnit),
				safeUnit,
				ingredientName: ingredient.ingredientName,
			});
		}
		const base = effectiveBaseFields(
			ingredient.quantity,
			safeUnit,
			ingredient.baseQuantity,
			ingredient.baseUnit,
			ingredient.ingredientName,
		);
		const key = `${normalizedName}__${domain}`;

		const existing = aggregation.get(key);
		if (existing) {
			const merged = mergeIntoAggregation(
				existing,
				base.baseQuantity,
				base.baseUnit,
				ingredient.mealId,
				ingredient.ingredientName,
				row.supplyOrigin,
			);
			if (!merged) {
				// Incompatible units — keep as separate line with disambiguated key
				const fallbackKey = `${key}__${base.baseUnit}`;
				const fallbackExisting = aggregation.get(fallbackKey);
				if (fallbackExisting) {
					fallbackExisting.baseQuantity += base.baseQuantity;
					fallbackExisting.sourceMealIds.add(ingredient.mealId);
					fallbackExisting.sourceOrigins.add(row.supplyOrigin);
				} else {
					aggregation.set(fallbackKey, {
						name: ingredient.ingredientName,
						normalizedName,
						baseQuantity: base.baseQuantity,
						baseUnit: base.baseUnit,
						domain,
						sourceMealIds: new Set([ingredient.mealId]),
						sourceOrigins: new Set([row.supplyOrigin]),
					});
				}
			}
			continue;
		}

		aggregation.set(key, {
			name: ingredient.ingredientName,
			normalizedName,
			baseQuantity: base.baseQuantity,
			baseUnit: base.baseUnit,
			domain,
			sourceMealIds: new Set([ingredient.mealId]),
			sourceOrigins: new Set([row.supplyOrigin]),
		});
	}

	return Array.from(aggregation.values()).map((entry) => {
		const readable = chooseReadableUnit(entry.baseQuantity, entry.baseUnit);
		return {
			name: entry.name,
			normalizedName: entry.normalizedName,
			quantity: readable.quantity,
			unit: readable.unit,
			baseQuantity: entry.baseQuantity,
			baseUnit: entry.baseUnit,
			domain: entry.domain,
			sourceMealIds: Array.from(entry.sourceMealIds),
			sourceOrigins: Array.from(entry.sourceOrigins),
		};
	});
}

/**
 * Ensures a single "Supply" list exists for the organization.
 * If multiple lists exist, it keeps the most recently updated one, renames it to "Supply",
 * and deletes the others (per user directive to destroy data if easier).
 * If no list exists, creates a new one named "Supply".
 */
export async function ensureSupplyList(
	db: D1Database,
	organizationId: string,
	options?: SupplyItemsFetchOptions,
) {
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
		return getSupplyListById(db, organizationId, existing.id, options);
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

	return getSupplyListById(db, organizationId, primaryList.id, options);
}

/**
 * Filters supply items to those whose names match cargo rows carrying any of the given tags (OR logic).
 */
export function filterSupplyItemsByCargoTags<T extends { name: string }>(
	items: T[],
	cargoRows: { name: string; tags: unknown }[],
	supplyTags: string[] | undefined,
): T[] {
	if (!supplyTags?.length) return items;
	const tagSet = new Set(supplyTags);
	const namesWithTag = new Set(
		cargoRows
			.filter((row) => {
				const tags = parseSupplyCargoTags(row.tags);
				return tags.some((tag) => tagSet.has(tag));
			})
			.map((row) => row.name.toLowerCase()),
	);
	return items.filter((item) => namesWithTag.has(item.name.toLowerCase()));
}

function parseSupplyCargoTags(tags: unknown): string[] {
	if (Array.isArray(tags)) {
		return tags.filter((tag): tag is string => typeof tag === "string");
	}
	if (typeof tags === "string") {
		try {
			const parsed: unknown = JSON.parse(tags);
			if (Array.isArray(parsed)) {
				return parsed.filter((tag): tag is string => typeof tag === "string");
			}
		} catch {
			return tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean);
		}
	}
	return [];
}

/** Bounds the `supply_item` row fetch — omit both to fetch all rows (default, current behavior). */
export interface SupplyItemsFetchOptions {
	limit?: number;
	offset?: number;
}

/**
 * Retrieves the "Supply" list for an organization.
 * This is the main entry point for the UI.
 *
 * Pass `options.limit`/`options.offset` to bound the item-row fetch (see H-4);
 * omit to fetch all items (needed by callers that compute totals/merges over
 * the complete list, e.g. supply-sync and the web grocery view).
 */
export async function getSupplyList(
	db: D1Database,
	organizationId: string,
	options?: SupplyItemsFetchOptions,
) {
	return ensureSupplyList(db, organizationId, options);
}

/**
 * Retrieves a single supply list by ID with all its items.
 */
export async function getSupplyListById(
	db: D1Database,
	organizationId: string,
	listId: string,
	options?: SupplyItemsFetchOptions,
) {
	const d1 = drizzle(db);

	const itemsQuery = d1
		.select()
		.from(supplyItem)
		.where(eq(supplyItem.listId, listId))
		.orderBy(supplyItem.createdAt, supplyItem.id)
		.$dynamic()
		.limit(options?.limit ?? Number.MAX_SAFE_INTEGER)
		.offset(options?.offset ?? 0);

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
		itemsQuery,
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
		const sourceMeals = await chunkedQuery(
			sourceMealIds,
			(chunk) =>
				d1
					.select({ id: meal.id, name: meal.name })
					.from(meal)
					.where(inArray(meal.id, chunk)),
			99,
		);
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
			sourceOrigins: normalizeSupplyOrigins(item.sourceOrigins),
		};
	});

	return {
		...list,
		items,
	};
}

/**
 * Lightweight COUNT-style aggregate for a supply list's item totals — used by
 * the hub widget (H-3) so per-request counts don't require fetching every row.
 * Only valid when no cargo-tag filter is applied (callers filtering by tag
 * need the full row set to match against item names; see hub.server.ts).
 */
export async function getSupplyItemStats(
	db: D1Database,
	listId: string,
): Promise<{ itemCount: number; purchasedCount: number }> {
	const d1 = drizzle(db);
	const [row] = await d1
		.select({
			itemCount: sql<number>`count(*)`,
			purchasedCount: sql<number>`coalesce(sum(case when ${supplyItem.isPurchased} then 1 else 0 end), 0)`,
		})
		.from(supplyItem)
		.where(eq(supplyItem.listId, listId));

	return {
		itemCount: row?.itemCount ?? 0,
		purchasedCount: row?.purchasedCount ?? 0,
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
		id: list.id,
		organizationId: list.organizationId,
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
			...computeBaseFields(data.quantity || 1, data.unit || "unit", data.name),
			domain: data.domain || "food",
			sourceMealId: data.sourceMealId,
			sourceMealIds:
				data.sourceMealIds && data.sourceMealIds.length > 0
					? data.sourceMealIds
					: data.sourceMealId
						? [data.sourceMealId]
						: [],
			sourceOrigins:
				data.sourceMealId || data.sourceMealIds?.length ? [] : ["manual"],
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

	const nextQuantity = data.quantity ?? existing.quantity;
	const nextUnit = data.unit ?? existing.unit;
	const nextName = data.name ?? existing.name;
	const base = computeBaseFields(nextQuantity, nextUnit, nextName);

	await d1.batch([
		d1
			.update(supplyItem)
			.set({
				name: nextName,
				quantity: nextQuantity,
				unit: nextUnit,
				baseQuantity: base.baseQuantity,
				baseUnit: base.baseUnit,
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
 * Converts an item's unit to either shopping-friendly or cooking-friendly form.
 */
export async function convertSupplyItemUnit(
	db: D1Database,
	organizationId: string,
	listId: string,
	itemId: string,
	mode: "shopping" | "cooking",
	preferredSystem: "metric" | "imperial" = "metric",
) {
	const d1 = drizzle(db);

	// Verify list ownership before fetching item to prevent cross-org enumeration.
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

	const [item] = await d1
		.select()
		.from(supplyItem)
		.where(and(eq(supplyItem.id, itemId), eq(supplyItem.listId, listId)));

	if (!item) throw new Error("Supply item not found");

	const sourceUnit = toSupportedUnit(item.unit);
	const converted =
		mode === "cooking"
			? toCookingUnit(item.quantity, sourceUnit, item.name)
			: toShoppingUnit(item.quantity, sourceUnit, item.name, preferredSystem);

	return updateSupplyItem(db, organizationId, listId, itemId, {
		quantity: converted.quantity,
		unit: converted.unit,
	});
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

	const normalizedName = normalizeForCargoDedup(existing.name);
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
		fetchOrgCargoIndex(env.DB, organizationId),
		d1.select().from(supplyItem).where(eq(supplyItem.listId, listId)),
	]);

	// Pre-fetch all Vectorize results in one batch instead of one call per ingredient
	const ingredientNames = ingredients.map((i) => i.ingredientName);
	const prefetchedVectors = await findSimilarCargoBatch(
		env,
		organizationId,
		ingredientNames,
		{ topK: 1, threshold: SIMILARITY_THRESHOLDS.INGREDIENT_MATCH },
	);

	const addedItems: (typeof supplyItem.$inferSelect)[] = [];
	const skippedItems: { name: string; reason: string }[] = [];

	// Check each ingredient against inventory
	for (const ingredient of ingredients) {
		const targetUnit = ingredient.unit as SupportedUnit;
		const normalizedName = normalizeForCargoDedup(ingredient.ingredientName);
		const scaledRequired = scaleQuantity(
			ingredient.quantity,
			scaleFactor,
			ingredient.unit,
		);
		const availableInCargo = getAvailableCargoQuantity(
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
			if (normalizeForCargoDedup(item.name) !== normalizedName) return false;
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
	unitMode: UnitDisplayMode = "metric",
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
	const rawIngredients = await d1
		.select({
			meal_ingredient: {
				ingredientName: mealIngredient.ingredientName,
				quantity: mealIngredient.quantity,
				unit: mealIngredient.unit,
				baseQuantity: mealIngredient.baseQuantity,
				baseUnit: mealIngredient.baseUnit,
				mealId: mealIngredient.mealId,
			},
			meal_domain: meal.domain,
		})
		.from(mealIngredient)
		.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
		.where(eq(meal.organizationId, organizationId));

	const allIngredients: IngredientRow[] = rawIngredients.map((row) => ({
		...row,
		supplyOrigin: "galley",
	}));

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
		undefined,
		unitMode,
	);
}

/**
 * Builds IngredientRow[] for a flat list of { mealId, servingsOverride } occurrences.
 * Each occurrence is included independently so the same meal on multiple days sums correctly.
 */
async function buildIngredientRowsFromOccurrences(
	d1: ReturnType<typeof drizzle>,
	organizationId: string,
	occurrences: Array<{
		mealId: string;
		servingsOverride: number | null;
		supplyOrigin: MealSupplyOrigin;
	}>,
): Promise<IngredientRow[]> {
	if (occurrences.length === 0) return [];

	const allMealIds = [...new Set(occurrences.map((o) => o.mealId))];

	// Batch-load meal metadata and ingredients for all unique meal IDs.
	// Chunk to stay under D1's 100 bound-parameter limit (orgId + inArray).
	const [mealRows, ingredientRows] = await Promise.all([
		chunkedQuery(
			allMealIds,
			(chunk) =>
				d1
					.select({ id: meal.id, domain: meal.domain, servings: meal.servings })
					.from(meal)
					.where(
						and(
							eq(meal.organizationId, organizationId),
							inArray(meal.id, chunk),
						),
					),
			99,
		),
		chunkedQuery(
			allMealIds,
			(chunk) =>
				d1
					.select({
						mealId: mealIngredient.mealId,
						ingredientName: mealIngredient.ingredientName,
						quantity: mealIngredient.quantity,
						unit: mealIngredient.unit,
						baseQuantity: mealIngredient.baseQuantity,
						baseUnit: mealIngredient.baseUnit,
						isOptional: mealIngredient.isOptional,
					})
					.from(mealIngredient)
					.where(inArray(mealIngredient.mealId, chunk)),
			99,
		),
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
			if (ing.isOptional) continue;
			result.push({
				meal_ingredient: {
					ingredientName: ing.ingredientName,
					quantity: scaleQuantity(ing.quantity, scaleFactor, ing.unit),
					unit: ing.unit,
					baseQuantity: scaleQuantity(
						ing.baseQuantity,
						scaleFactor,
						ing.baseUnit,
					),
					baseUnit: ing.baseUnit,
					mealId: ing.mealId,
				},
				meal_domain: domain,
				supplyOrigin: occurrence.supplyOrigin,
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
	unitMode: UnitDisplayMode = "metric",
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
		const unified: Array<{
			mealId: string;
			servingsOverride: number | null;
			supplyOrigin: MealSupplyOrigin;
		}> = [
			...manifestOccurrences.map((m) => ({
				mealId: m.mealId,
				servingsOverride: m.servingsOverride,
				supplyOrigin: "manifest" as const,
			})),
			...galleySelections.map((g) => ({
				mealId: g.mealId,
				servingsOverride: g.servingsOverride,
				supplyOrigin: "galley" as const,
			})),
		];

		const mealsQueryDurationMs = Date.now() - mealsQueryStartedAtMs;

		if (unified.length === 0) {
			const cargoSummary = await syncCargoRestockSelections(
				env,
				organizationId,
				telemetry,
			);
			const supplyList = await ensureSupplyList(env.DB, organizationId);
			if (!supplyList) throw new Error("Failed to ensure supply list");

			const list = await getSupplyListById(
				env.DB,
				organizationId,
				supplyList.id,
			);
			if (!list) throw new Error("List retrieval failed");

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
					cargo_restock_count: cargoSummary.addedItems,
				},
			);

			return {
				list,
				summary: {
					addedItems: cargoSummary.addedItems,
					skippedItems: cargoSummary.skippedItems,
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

		// Step 3: Meal-derived sync + cargo restock
		const syncResult = await syncSupplyFromIngredientRows(
			env,
			organizationId,
			allIngredients,
			unified.length,
			telemetry,
			unitMode,
		);

		const cargoSummary = await syncCargoRestockSelections(
			env,
			organizationId,
			telemetry,
		);

		const list = await getSupplyListById(
			env.DB,
			organizationId,
			syncResult.list?.id ?? "",
		);
		if (!list) throw new Error("List retrieval failed");

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
				cargo_restock_count: cargoSummary.addedItems,
			},
		);

		return {
			list,
			summary: {
				addedItems: syncResult.summary.addedItems + cargoSummary.addedItems,
				skippedItems:
					syncResult.summary.skippedItems + cargoSummary.skippedItems,
				mealsProcessed: syncResult.summary.mealsProcessed,
				totalIngredients: syncResult.summary.totalIngredients,
			},
		};
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

async function syncCargoRestockSelections(
	env: Env,
	organizationId: string,
	telemetryContext?: SupplySyncTelemetryContext,
): Promise<{ addedItems: number; skippedItems: number }> {
	const d1 = drizzle(env.DB);
	const selections = await getActiveCargoSelections(env.DB, organizationId);
	if (selections.length === 0) {
		return { addedItems: 0, skippedItems: 0 };
	}

	const supplyListData = await ensureSupplyList(env.DB, organizationId);
	if (!supplyListData) {
		throw new Error("Failed to ensure supply list");
	}

	await d1
		.delete(supplyItem)
		.where(
			and(
				eq(supplyItem.listId, supplyListData.id),
				eq(supplyItem.isPurchased, false),
				isNotNull(supplyItem.sourceCargoId),
			),
		);

	const refreshedList = await getSupplyListById(
		env.DB,
		organizationId,
		supplyListData.id,
	);
	if (!refreshedList) throw new Error("List retrieval failed");

	const cargoIds = selections.map((s) => s.cargoId);
	const cargoRows = await chunkedQuery(
		cargoIds,
		(chunk) =>
			d1
				.select({
					id: cargo.id,
					name: cargo.name,
					unit: cargo.unit,
					domain: cargo.domain,
					quantity: cargo.quantity,
				})
				.from(cargo)
				.where(
					and(
						eq(cargo.organizationId, organizationId),
						inArray(cargo.id, chunk),
					),
				),
		99,
	);
	const cargoById = new Map(cargoRows.map((c) => [c.id, c]));
	const selectionByCargoId = new Map(selections.map((s) => [s.cargoId, s]));

	const snoozeKeys = await getActiveSnoozeKeys(d1, organizationId);
	const existingItems = refreshedList.items ?? [];
	const itemsToInsert: (typeof supplyItem.$inferInsert)[] = [];
	const itemsToUpdate: Array<{
		id: string;
		sourceOrigins: SupplyItemOrigin[];
		sourceCargoId: string;
	}> = [];
	let addedCount = 0;
	let skippedCount = 0;

	for (const [cargoId, selection] of selectionByCargoId) {
		const cargoRow = cargoById.get(cargoId);
		if (!cargoRow) {
			skippedCount++;
			continue;
		}

		const normalizedName = normalizeForCargoDedup(cargoRow.name);
		const domain = cargoRow.domain ?? "food";
		const snoozeKey = `${normalizedName}__${domain}`;
		if (snoozeKeys.has(snoozeKey)) {
			skippedCount++;
			continue;
		}

		const restockQty = selection.quantityOverride ?? 1;
		const unit = toSupportedUnit(cargoRow.unit ?? "unit");

		const existingMatch = existingItems.find(
			(item) =>
				!item.isPurchased &&
				normalizeForCargoDedup(item.name) === normalizedName &&
				item.domain === domain,
		);

		if (existingMatch) {
			const mergedOrigins = mergeSupplyOrigins(
				normalizeSupplyOrigins(existingMatch.sourceOrigins),
				["cargo"],
			);
			itemsToUpdate.push({
				id: existingMatch.id,
				sourceOrigins: mergedOrigins,
				sourceCargoId: cargoId,
			});
			addedCount++;
			continue;
		}

		itemsToInsert.push({
			id: crypto.randomUUID(),
			listId: supplyListData.id,
			name: cargoRow.name,
			quantity: restockQty,
			unit,
			...computeBaseFields(restockQty, unit, cargoRow.name),
			domain,
			sourceOrigins: ["cargo"],
			sourceCargoId: cargoId,
		});
		addedCount++;
	}

	if (itemsToUpdate.length > 0) {
		const updateStmts = itemsToUpdate.map((update) =>
			d1
				.update(supplyItem)
				.set({
					sourceOrigins: update.sourceOrigins,
					sourceCargoId: update.sourceCargoId,
				})
				.where(eq(supplyItem.id, update.id)),
		);
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(updateStmts as [any, ...any[]]);
	}

	if (itemsToInsert.length > 0 || itemsToUpdate.length > 0) {
		if (itemsToInsert.length > 0) {
			await chunkedInsert(
				itemsToInsert,
				D1_MAX_SUPPLY_ROWS_PER_STATEMENT,
				(insertChunk) => d1.insert(supplyItem).values(insertChunk),
			);
		}
		await d1
			.update(supplyList)
			.set({ updatedAt: new Date() })
			.where(eq(supplyList.id, supplyListData.id));
	}

	emitSupplySyncInfo(
		"supply_sync.cargo_restock.success",
		{
			...(telemetryContext ?? {
				trigger: "dashboard_grocery_action_update_list",
			}),
			organizationId,
			listId: supplyListData.id,
		},
		{
			selection_count: selections.length,
			added_items_count: addedCount,
			skipped_items_count: skippedCount,
		},
	);

	return { addedItems: addedCount, skippedItems: skippedCount };
}

async function syncSupplyFromIngredientRows(
	env: Env,
	organizationId: string,
	allIngredients: IngredientRow[],
	mealsProcessed: number,
	telemetryContext?: SupplySyncTelemetryContext,
	unitMode: UnitDisplayMode = "metric",
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
		const orgCargo = await fetchOrgCargoIndex(env.DB, organizationId);
		const inventoryFetchDurationMs = Date.now() - inventoryFetchStartedAtMs;

		const aggregateStartedAtMs = Date.now();
		const aggregatedIngredients = aggregateIngredients(
			allIngredients,
			unitMode,
		);
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
			{ topK: 1, threshold: SIMILARITY_THRESHOLDS.INGREDIENT_MATCH },
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

			const targetUnit = toSupportedUnit(aggregated.baseUnit);
			const availableInCargo = getAvailableCargoQuantity(
				aggregated.name,
				targetUnit,
				orgCargo,
				prefetchedVectors,
			);
			const missingAfterCargo = Math.max(
				0,
				aggregated.baseQuantity - availableInCargo,
			);

			if (missingAfterCargo <= 0) {
				skippedCount++;
				continue;
			}

			const existingQuantityInList = getExistingListQuantity(
				existingItems,
				aggregated.normalizedName,
				targetUnit,
				aggregated.domain,
				aggregated.name,
			);
			const remainingNeededBase = Math.max(
				0,
				missingAfterCargo - existingQuantityInList,
			);

			if (remainingNeededBase <= 0) {
				skippedCount++;
				continue;
			}

			const readable = chooseReadableUnit(
				remainingNeededBase,
				aggregated.baseUnit,
			);

			itemsToInsert.push({
				id: crypto.randomUUID(),
				listId: supplyListData.id,
				name: aggregated.name,
				quantity: readable.quantity,
				unit: readable.unit,
				baseQuantity: remainingNeededBase,
				baseUnit: aggregated.baseUnit,
				domain: aggregated.domain,
				sourceMealId: aggregated.sourceMealIds[0],
				sourceMealIds: aggregated.sourceMealIds,
				sourceOrigins: aggregated.sourceOrigins,
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

export type SupplyScanCompleteInput = {
	scanItemId: string;
	supplyItemId: string | null;
	dock: {
		name: string;
		quantity: number;
		unit: string;
		domain: string;
		tags?: string[];
		expiresAt?: string;
		mergeTargetId?: string;
	};
	updateSupply?: { quantity: number; unit: string };
};

/**
 * Docks receipt-selected items to Cargo and reconciles linked supply rows.
 */
export async function completeSupplyFromScan(
	env: Env,
	organizationId: string,
	listId: string,
	pairs: SupplyScanCompleteInput[],
) {
	if (pairs.length === 0) {
		return { docked: 0, supplyUpdated: 0, supplyRemoved: 0 };
	}

	const d1 = drizzle(env.DB);

	const [list] = await d1
		.select({ id: supplyList.id })
		.from(supplyList)
		.where(
			and(
				eq(supplyList.id, listId),
				eq(supplyList.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!list) throw new Error("Supply list not found or unauthorized");

	const dockInputs = pairs.map((p) => ({
		name: p.dock.name,
		quantity: p.dock.quantity,
		unit: toSupportedUnit(p.dock.unit) as SupportedUnit,
		domain: p.dock.domain as (typeof ITEM_DOMAINS)[number],
		tags: p.dock.tags ?? [],
		expiresAt: p.dock.expiresAt
			? (toExpiryDate(p.dock.expiresAt) ?? undefined)
			: undefined,
		mergeTargetId: p.dock.mergeTargetId,
	}));

	const ingestResults = await ingestCargoItems(
		env,
		organizationId,
		dockInputs,
		{
			strictMergeTarget: false,
		},
	);

	let updated = 0;
	let created = 0;
	for (const r of ingestResults) {
		if (r.status === "merged") updated += 1;
		else if (r.status === "created") created += 1;
	}
	const ingestResult = { updated, created };

	const ledgerOps = pairs.map((p) =>
		d1.insert(ledger).values({
			organizationId,
			amount: 0,
			reason: `dock: ${p.dock.name} (+${p.dock.quantity} ${p.dock.unit})`,
		}),
	);

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const batchStmts: any[] = [...ledgerOps];
	let supplyUpdated = 0;
	const removeIds = new Set<string>();

	for (const pair of pairs) {
		if (!pair.supplyItemId) continue;
		removeIds.add(pair.supplyItemId);
		if (pair.updateSupply) {
			supplyUpdated++;
			batchStmts.push(
				d1
					.update(supplyItem)
					.set({
						quantity: pair.updateSupply.quantity,
						unit: pair.updateSupply.unit,
						isPurchased: true,
					})
					.where(
						and(
							eq(supplyItem.id, pair.supplyItemId),
							eq(supplyItem.listId, listId),
						),
					),
			);
		}
	}

	for (const itemId of removeIds) {
		batchStmts.push(
			d1
				.delete(supplyItem)
				.where(and(eq(supplyItem.id, itemId), eq(supplyItem.listId, listId))),
		);
	}

	batchStmts.push(
		d1
			.update(supplyList)
			.set({ updatedAt: new Date() })
			.where(eq(supplyList.id, listId)),
	);

	if (batchStmts.length > 0) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(batchStmts as [any, ...any[]]);
	}

	return {
		docked: ingestResult.updated + ingestResult.created,
		supplyUpdated,
		supplyRemoved: removeIds.size,
	};
}
