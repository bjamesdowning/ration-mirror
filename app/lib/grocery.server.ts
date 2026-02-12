import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	activeMealSelection,
	groceryItem,
	groceryList,
	inventory,
	meal,
	mealIngredient,
} from "../db/schema";
import { dockGroceryItems } from "./inventory.server";
import { normalizeForMatch, tokenMatchScore } from "./matching.server";
import {
	chunkArray,
	chunkedInsert,
	D1_MAX_BOUND_PARAMS,
} from "./query-utils.server";
import {
	emitSupplySyncError,
	emitSupplySyncInfo,
	type SupplySyncTelemetryContext,
} from "./telemetry.server";
import {
	type BaseUnit,
	chooseReadableUnit,
	convertQuantity,
	getUnitMultiplier,
	normalizeToBaseUnit,
	type SupportedUnit,
} from "./units";

const SHARE_TOKEN_EXPIRY_DAYS = 7;
const SHARE_TOKEN_EXPIRY_SECONDS = SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
const SUPPLY_LIST_NAME = "Supply";
const D1_MAX_GROCERY_ROWS_PER_STATEMENT = Math.floor(D1_MAX_BOUND_PARAMS / 7);

export interface GroceryItemInput {
	name: string;
	quantity?: number;
	unit?: string;
	domain?: string;
	sourceMealId?: string;
}

export interface GroceryListInput {
	name?: string;
}

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

function getAvailableInventoryQuantity(
	name: string,
	targetUnit: SupportedUnit,
	orgInventory: (typeof inventory.$inferSelect)[],
): number {
	const normalizedName = normalizeForMatch(name);
	let exactTotal = 0;
	let bestFuzzyQuantity = 0;
	let bestFuzzyScore = 0;

	for (const item of orgInventory) {
		const itemUnit = item.unit as SupportedUnit;
		const multiplier = getUnitMultiplier(itemUnit, targetUnit);
		if (multiplier === null) continue;

		const normalizedItem = normalizeForMatch(item.name);
		const convertedQuantity = item.quantity * multiplier;
		if (normalizedItem === normalizedName) {
			exactTotal += convertedQuantity;
			continue;
		}

		const fuzzyScore = tokenMatchScore(name, item.name);
		if (fuzzyScore < 0.8) continue;
		if (fuzzyScore > bestFuzzyScore) {
			bestFuzzyScore = fuzzyScore;
			bestFuzzyQuantity = convertedQuantity;
		}
	}

	if (exactTotal > 0) return exactTotal;
	return bestFuzzyQuantity;
}

function getExistingListQuantity(
	items: (typeof groceryItem.$inferSelect)[],
	normalizedName: string,
	targetUnit: SupportedUnit,
	domain: string,
): number {
	let total = 0;
	for (const item of items) {
		if ((item.domain ?? "food") !== domain) continue;
		if (normalizeForMatch(item.name) !== normalizedName) continue;

		const multiplier = getUnitMultiplier(
			item.unit as SupportedUnit,
			targetUnit,
		);
		if (multiplier === null) continue;
		total += item.quantity * multiplier;
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
		const normalized = normalizeToBaseUnit(
			ingredient.quantity,
			ingredient.unit as SupportedUnit,
		);
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

	// Get all lists, ordered by update time (most recent first)
	const lists = await d1
		.select()
		.from(groceryList)
		.where(eq(groceryList.organizationId, organizationId))
		.orderBy(desc(groceryList.updatedAt));

	if (lists.length === 0) {
		// No lists, create one
		return createGroceryList(db, organizationId, { name: SUPPLY_LIST_NAME });
	}

	const [primaryList, ...listsToDelete] = lists;

	// Update primary list name if needed
	if (primaryList.name !== SUPPLY_LIST_NAME) {
		await d1
			.update(groceryList)
			.set({ name: SUPPLY_LIST_NAME, updatedAt: new Date() })
			.where(eq(groceryList.id, primaryList.id));
		primaryList.name = SUPPLY_LIST_NAME;
	}

	// Delete extra lists if any
	if (listsToDelete.length > 0) {
		const idsToDelete = listsToDelete.map((l) => l.id);
		for (const deleteChunk of chunkArray(idsToDelete, D1_MAX_BOUND_PARAMS)) {
			await d1.delete(groceryList).where(inArray(groceryList.id, deleteChunk));
		}
	}

	// Return the full list with items
	return getGroceryList(db, organizationId, primaryList.id);
}

/**
 * Retrieves the "Supply" list for an organization.
 * This is the main entry point for the UI.
 */
export async function getSupplyList(db: D1Database, organizationId: string) {
	return ensureSupplyList(db, organizationId);
}

/**
 * Retrieves a single grocery list by ID with all its items.
 */
export async function getGroceryList(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	const [lists, items] = await d1.batch([
		d1
			.select()
			.from(groceryList)
			.where(
				and(
					eq(groceryList.id, listId),
					eq(groceryList.organizationId, organizationId),
				),
			),
		d1.select().from(groceryItem).where(eq(groceryItem.listId, listId)),
	]);

	const list = lists[0];
	if (!list) return null;

	return {
		...list,
		items,
	};
}

/**
 * Retrieves a grocery list by share token (public access - no organizationId verification).
 */
export async function getGroceryListByShareToken(
	db: D1Database,
	shareToken: string,
) {
	const d1 = drizzle(db);

	const [lists, items] = await d1.batch([
		d1.select().from(groceryList).where(eq(groceryList.shareToken, shareToken)),
		d1
			.select({
				id: groceryItem.id,
				name: groceryItem.name,
				quantity: groceryItem.quantity,
				unit: groceryItem.unit,
				domain: groceryItem.domain,
				isPurchased: groceryItem.isPurchased,
			})
			.from(groceryItem)
			.innerJoin(groceryList, eq(groceryItem.listId, groceryList.id))
			.where(eq(groceryList.shareToken, shareToken)),
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
 * Toggles a grocery item's purchased status using a share token.
 * Public access - validates share token and expiry, and only updates isPurchased.
 */
export async function toggleSharedItemPurchased(
	db: D1Database,
	shareToken: string,
	itemId: string,
	isPurchased: boolean,
) {
	const d1 = drizzle(db);

	const [list] = await d1
		.select({
			id: groceryList.id,
			shareExpiresAt: groceryList.shareExpiresAt,
		})
		.from(groceryList)
		.where(eq(groceryList.shareToken, shareToken));

	if (!list) throw new Error("Shared list not found");

	if (list.shareExpiresAt && new Date(list.shareExpiresAt) < new Date()) {
		throw new Error("Share link has expired");
	}

	const [item] = await d1
		.select({ id: groceryItem.id })
		.from(groceryItem)
		.where(and(eq(groceryItem.id, itemId), eq(groceryItem.listId, list.id)));

	if (!item) throw new Error("Item not found");

	await d1
		.update(groceryItem)
		.set({ isPurchased })
		.where(eq(groceryItem.id, itemId));

	return { id: itemId, isPurchased };
}

/**
 * Creates a new grocery list for an organization.
 */
export async function createGroceryList(
	db: D1Database,
	organizationId: string,
	data?: GroceryListInput,
) {
	const d1 = drizzle(db);
	const listId = crypto.randomUUID();

	await d1.insert(groceryList).values({
		id: listId,
		organizationId,
		name: data?.name || "Shopping List",
	});

	return await getGroceryList(db, organizationId, listId);
}

/**
 * Updates a grocery list's metadata.
 */
export async function updateGroceryList(
	db: D1Database,
	organizationId: string,
	listId: string,
	data: GroceryListInput,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [existing] = await d1
		.select()
		.from(groceryList)
		.where(
			and(
				eq(groceryList.id, listId),
				eq(groceryList.organizationId, organizationId),
			),
		);

	if (!existing) throw new Error("Grocery list not found or unauthorized");

	await d1
		.update(groceryList)
		.set({
			name: data.name || existing.name,
			updatedAt: new Date(),
		})
		.where(eq(groceryList.id, listId));

	return await getGroceryList(db, organizationId, listId);
}

/**
 * Deletes a grocery list and all its items (cascade).
 */
export async function deleteGroceryList(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	return await d1
		.delete(groceryList)
		.where(
			and(
				eq(groceryList.id, listId),
				eq(groceryList.organizationId, organizationId),
			),
		);
}

/**
 * Adds an item to a grocery list.
 */
export async function addGroceryItem(
	db: D1Database,
	organizationId: string,
	listId: string,
	data: GroceryItemInput,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(
			and(
				eq(groceryList.id, listId),
				eq(groceryList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Grocery list not found or unauthorized");

	const itemId = crypto.randomUUID();

	await d1.batch([
		d1.insert(groceryItem).values({
			id: itemId,
			listId,
			name: data.name,
			quantity: data.quantity || 1,
			unit: data.unit || "unit",
			domain: data.domain || "food",
			sourceMealId: data.sourceMealId,
		}),
		d1
			.update(groceryList)
			.set({ updatedAt: new Date() })
			.where(eq(groceryList.id, listId)),
	]);

	const [item] = await d1
		.select()
		.from(groceryItem)
		.where(eq(groceryItem.id, itemId));

	return item;
}

/**
 * Updates a grocery item.
 */
export async function updateGroceryItem(
	db: D1Database,
	organizationId: string,
	listId: string,
	itemId: string,
	data: Partial<GroceryItemInput & { isPurchased?: boolean }>,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(
			and(
				eq(groceryList.id, listId),
				eq(groceryList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Grocery list not found or unauthorized");

	// Verify item belongs to list
	const [existing] = await d1
		.select()
		.from(groceryItem)
		.where(and(eq(groceryItem.id, itemId), eq(groceryItem.listId, listId)));

	if (!existing) throw new Error("Grocery item not found");

	await d1.batch([
		d1
			.update(groceryItem)
			.set({
				name: data.name ?? existing.name,
				quantity: data.quantity ?? existing.quantity,
				unit: data.unit ?? existing.unit,
				domain: data.domain ?? existing.domain,
				isPurchased: data.isPurchased ?? existing.isPurchased,
			})
			.where(eq(groceryItem.id, itemId)),
		d1
			.update(groceryList)
			.set({ updatedAt: new Date() })
			.where(eq(groceryList.id, listId)),
	]);

	const [item] = await d1
		.select()
		.from(groceryItem)
		.where(eq(groceryItem.id, itemId));

	return item;
}

/**
 * Deletes a grocery item.
 */
export async function deleteGroceryItem(
	db: D1Database,
	organizationId: string,
	listId: string,
	itemId: string,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(
			and(
				eq(groceryList.id, listId),
				eq(groceryList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Grocery list not found or unauthorized");

	await d1.batch([
		d1
			.delete(groceryItem)
			.where(and(eq(groceryItem.id, itemId), eq(groceryItem.listId, listId))),
		d1
			.update(groceryList)
			.set({ updatedAt: new Date() })
			.where(eq(groceryList.id, listId)),
	]);

	return { deleted: true };
}

/**
 * Generates a share token for a grocery list.
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
		.from(groceryList)
		.where(
			and(
				eq(groceryList.id, listId),
				eq(groceryList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Grocery list not found or unauthorized");

	// Generate a URL-safe token
	const shareToken = crypto.randomUUID().replace(/-/g, "");
	const shareExpiresAt = new Date(
		Date.now() + SHARE_TOKEN_EXPIRY_SECONDS * 1000,
	);

	await d1
		.update(groceryList)
		.set({
			shareToken,
			shareExpiresAt,
			updatedAt: new Date(),
		})
		.where(eq(groceryList.id, listId));

	return {
		shareToken,
		shareExpiresAt,
	};
}

/**
 * Revokes the share token for a grocery list.
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
		.from(groceryList)
		.where(
			and(
				eq(groceryList.id, listId),
				eq(groceryList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Grocery list not found or unauthorized");

	await d1
		.update(groceryList)
		.set({
			shareToken: null,
			shareExpiresAt: null,
			updatedAt: new Date(),
		})
		.where(eq(groceryList.id, listId));

	return { revoked: true };
}

/**
 * Adds missing ingredients from a meal to a grocery list.
 * This performs inventory matching to only add items the organization doesn't have.
 */
export async function addItemsFromMeal(
	db: D1Database,
	organizationId: string,
	listId: string,
	mealId: string,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(
			and(
				eq(groceryList.id, listId),
				eq(groceryList.organizationId, organizationId),
			),
		);

	if (!list) throw new Error("Grocery list not found or unauthorized");

	// Get meal ingredients
	const ingredients = await d1
		.select()
		.from(mealIngredient)
		.where(eq(mealIngredient.mealId, mealId));
	const [mealRecord] = await d1
		.select({ domain: meal.domain })
		.from(meal)
		.where(eq(meal.id, mealId));
	const mealDomain = mealRecord?.domain ?? "food";

	if (ingredients.length === 0) {
		return { addedItems: [], skippedItems: [] };
	}

	// Get organization's current inventory
	const orgInventory = await d1
		.select()
		.from(inventory)
		.where(eq(inventory.organizationId, organizationId));
	const existingListItems = await d1
		.select()
		.from(groceryItem)
		.where(eq(groceryItem.listId, listId));

	const addedItems: (typeof groceryItem.$inferSelect)[] = [];
	const skippedItems: { name: string; reason: string }[] = [];

	// Check each ingredient against inventory
	for (const ingredient of ingredients) {
		const targetUnit = ingredient.unit as SupportedUnit;
		const normalizedName = normalizeForMatch(ingredient.ingredientName);
		const availableInInventory = getAvailableInventoryQuantity(
			ingredient.ingredientName,
			targetUnit,
			orgInventory,
		);

		if (availableInInventory >= ingredient.quantity) {
			// Organization has enough of this item
			skippedItems.push({
				name: ingredient.ingredientName,
				reason: "Sufficient quantity in inventory",
			});
			continue;
		}

		const neededQuantity = ingredient.quantity - availableInInventory;
		const alreadyInList = getExistingListQuantity(
			existingListItems,
			normalizedName,
			targetUnit,
			mealDomain,
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
					.update(groceryItem)
					.set({ quantity: mergeTarget.quantity + delta })
					.where(eq(groceryItem.id, mergeTarget.id));

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
		} satisfies typeof groceryItem.$inferInsert;

		await d1.insert(groceryItem).values(newItemPayload);
		const [newItem] = await d1
			.select()
			.from(groceryItem)
			.where(eq(groceryItem.id, itemId));
		addedItems.push(newItem);
		existingListItems.push(newItem);
	}

	// Update list timestamp
	await d1
		.update(groceryList)
		.set({ updatedAt: new Date() })
		.where(eq(groceryList.id, listId));

	return { addedItems, skippedItems };
}

/**
 * Creates a grocery list from ALL organization meals with missing ingredients.
 * Aggregates ingredients across meals and deduplicates by name.
 * Only adds items that are missing or insufficient in inventory.
 */
export async function createGroceryListFromAllMeals(
	db: D1Database,
	organizationId: string,
	_listName?: string,
): Promise<{
	list: ReturnType<typeof getGroceryList> extends Promise<infer T> ? T : never;
	summary: GenerationSummary;
}> {
	const d1 = drizzle(db);

	// Get all organization meals
	const meals = await d1
		.select({ id: meal.id })
		.from(meal)
		.where(eq(meal.organizationId, organizationId));

	if (meals.length === 0) {
		const list = await ensureSupplyList(db, organizationId);
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
		const list = await ensureSupplyList(db, organizationId);
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
		db,
		organizationId,
		allIngredients,
		meals.length,
	);
}

/**
 * Creates/updates the Supply list from ONLY selected meals.
 * If no meals are selected, returns the Supply list unchanged.
 */
export async function createGroceryListFromSelectedMeals(
	db: D1Database,
	organizationId: string,
	_listName?: string,
	telemetryContext?: SupplySyncTelemetryContext,
): Promise<{
	list: ReturnType<typeof getGroceryList> extends Promise<infer T> ? T : never;
	summary: GenerationSummary;
}> {
	const startedAtMs = Date.now();
	const d1 = drizzle(db);
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
		const meals = await d1
			.select({ id: meal.id })
			.from(meal)
			.innerJoin(
				activeMealSelection,
				and(
					eq(activeMealSelection.mealId, meal.id),
					eq(activeMealSelection.organizationId, organizationId),
				),
			)
			.where(eq(meal.organizationId, organizationId));
		const mealsQueryDurationMs = Date.now() - mealsQueryStartedAtMs;

		if (meals.length === 0) {
			const supplyList = await ensureSupplyList(db, organizationId);
			if (!supplyList) {
				throw new Error("Failed to ensure supply list");
			}

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

		const ingredientQueryStartedAtMs = Date.now();
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
			.innerJoin(
				activeMealSelection,
				and(
					eq(activeMealSelection.mealId, meal.id),
					eq(activeMealSelection.organizationId, organizationId),
				),
			)
			.where(eq(meal.organizationId, organizationId));
		const ingredientQueryDurationMs = Date.now() - ingredientQueryStartedAtMs;

		if (allIngredients.length === 0) {
			const supplyList = await ensureSupplyList(db, organizationId);
			if (!supplyList) {
				throw new Error("Failed to ensure supply list");
			}

			emitSupplySyncInfo(
				"supply_sync.create_selected.success",
				{
					...(telemetry ?? { trigger: "dashboard_grocery_action_update_list" }),
					listId: supplyList.id,
					organizationId,
				},
				{
					duration_ms: Date.now() - startedAtMs,
					meals_selected_count: meals.length,
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
					mealsProcessed: meals.length,
					totalIngredients: 0,
				},
			};
		}

		const syncResult = await syncSupplyFromIngredientRows(
			db,
			organizationId,
			allIngredients,
			meals.length,
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
				meals_selected_count: meals.length,
				ingredient_rows_count: allIngredients.length,
				meals_query_duration_ms: mealsQueryDurationMs,
				ingredients_query_duration_ms: ingredientQueryDurationMs,
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
	db: D1Database,
	organizationId: string,
	allIngredients: IngredientRow[],
	mealsProcessed: number,
	telemetryContext?: SupplySyncTelemetryContext,
): Promise<{
	list: ReturnType<typeof getGroceryList> extends Promise<infer T> ? T : never;
	summary: GenerationSummary;
}> {
	const startedAtMs = Date.now();
	const d1 = drizzle(db);
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
		const supplyList = await ensureSupplyList(db, organizationId);
		const ensureListDurationMs = Date.now() - ensureListStartedAtMs;

		if (!supplyList) {
			throw new Error("Failed to ensure supply list");
		}

		const telemetryWithList = {
			...(telemetryContext ?? {
				trigger: "dashboard_grocery_action_update_list",
			}),
			organizationId,
			listId: supplyList.id,
		};

		const clearStartedAtMs = Date.now();
		await d1
			.delete(groceryItem)
			.where(
				and(
					eq(groceryItem.listId, supplyList.id),
					eq(groceryItem.isPurchased, false),
					isNotNull(groceryItem.sourceMealId),
				),
			);
		const clearDurationMs = Date.now() - clearStartedAtMs;

		const refreshListStartedAtMs = Date.now();
		const refreshedList = await getGroceryList(
			db,
			organizationId,
			supplyList.id,
		);
		const refreshListDurationMs = Date.now() - refreshListStartedAtMs;
		if (!refreshedList) throw new Error("List retrieval failed");

		const inventoryFetchStartedAtMs = Date.now();
		const orgInventory = await d1
			.select()
			.from(inventory)
			.where(eq(inventory.organizationId, organizationId));
		const inventoryFetchDurationMs = Date.now() - inventoryFetchStartedAtMs;

		const aggregateStartedAtMs = Date.now();
		const aggregatedIngredients = aggregateIngredients(allIngredients);
		const aggregateDurationMs = Date.now() - aggregateStartedAtMs;
		const existingItems = refreshedList.items ?? [];

		let addedCount = 0;
		let skippedCount = 0;
		const itemsToInsert: (typeof groceryItem.$inferInsert)[] = [];

		for (const aggregated of aggregatedIngredients) {
			const availableInInventory = getAvailableInventoryQuantity(
				aggregated.name,
				aggregated.unit,
				orgInventory,
			);
			const missingAfterInventory = Math.max(
				0,
				aggregated.quantity - availableInInventory,
			);

			if (missingAfterInventory <= 0) {
				skippedCount++;
				continue;
			}

			const existingQuantityInList = getExistingListQuantity(
				existingItems,
				aggregated.normalizedName,
				aggregated.unit,
				aggregated.domain,
			);
			const remainingNeeded = Math.max(
				0,
				missingAfterInventory - existingQuantityInList,
			);

			if (remainingNeeded <= 0) {
				skippedCount++;
				continue;
			}

			itemsToInsert.push({
				id: crypto.randomUUID(),
				listId: supplyList.id,
				name: aggregated.name,
				quantity: remainingNeeded,
				unit: aggregated.unit,
				domain: aggregated.domain,
				sourceMealId: aggregated.sourceMealIds[0],
			});
			addedCount++;
		}

		const insertChunkCount = Math.ceil(
			itemsToInsert.length / D1_MAX_GROCERY_ROWS_PER_STATEMENT,
		);
		const insertStartedAtMs = Date.now();
		if (itemsToInsert.length > 0) {
			await chunkedInsert(
				itemsToInsert,
				D1_MAX_GROCERY_ROWS_PER_STATEMENT,
				(insertChunk) => d1.insert(groceryItem).values(insertChunk),
			);

			await d1
				.update(groceryList)
				.set({ updatedAt: new Date() })
				.where(eq(groceryList.id, supplyList.id));
		}
		const insertDurationMs = Date.now() - insertStartedAtMs;

		const finalListFetchStartedAtMs = Date.now();
		const list = await getGroceryList(db, organizationId, supplyList.id);
		const finalListFetchDurationMs = Date.now() - finalListFetchStartedAtMs;
		if (!list) throw new Error("List retrieval failed");

		emitSupplySyncInfo("supply_sync.materialize.success", telemetryWithList, {
			duration_ms: Date.now() - startedAtMs,
			meals_processed_count: mealsProcessed,
			ingredient_rows_count: allIngredients.length,
			aggregated_ingredients_count: aggregatedIngredients.length,
			insert_candidate_rows_count: itemsToInsert.length,
			insert_chunk_count: insertChunkCount,
			insert_rows_per_statement: D1_MAX_GROCERY_ROWS_PER_STATEMENT,
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
 * Docks all purchased items from the list into inventory and removes them from the list.
 */
export async function completeGroceryList(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	// 1. Get purchased items
	const purchasedItems = await d1
		.select()
		.from(groceryItem)
		.where(
			and(eq(groceryItem.listId, listId), eq(groceryItem.isPurchased, true)),
		);

	if (purchasedItems.length === 0) {
		return {
			docked: 0,
			created: 0,
			message: "No purchased items to dock",
		};
	}

	// 2. Dock them
	const results = await dockGroceryItems(db, organizationId, purchasedItems);

	// 3. Remove them from the list (cleanup)
	for (const deleteChunk of chunkArray(purchasedItems, D1_MAX_BOUND_PARAMS)) {
		const deleteOps = deleteChunk.map((item) =>
			d1.delete(groceryItem).where(eq(groceryItem.id, item.id)),
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
