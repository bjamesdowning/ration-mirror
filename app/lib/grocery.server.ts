import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	groceryItem,
	groceryList,
	inventory,
	meal,
	mealIngredient,
} from "../db/schema";
import { dockGroceryItems } from "./inventory.server";

const SHARE_TOKEN_EXPIRY_DAYS = 7;
const SHARE_TOKEN_EXPIRY_SECONDS = SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
const SUPPLY_LIST_NAME = "Supply";

export interface GroceryItemInput {
	name: string;
	quantity?: number;
	unit?: string;
	category?: string;
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
		await d1.delete(groceryList).where(inArray(groceryList.id, idsToDelete));
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
 * @deprecated Use getSupplyList instead
 * Retrieves all grocery lists for an organization with their items.
 */
export async function getGroceryLists(db: D1Database, organizationId: string) {
	const d1 = drizzle(db);

	// First get all lists for this organization
	const lists = await d1
		.select()
		.from(groceryList)
		.where(eq(groceryList.organizationId, organizationId))
		.orderBy(desc(groceryList.updatedAt));

	if (lists.length === 0) {
		return [];
	}

	// Then get all items for those lists
	const listIds = lists.map((l) => l.id);
	const allItems = await d1
		.select()
		.from(groceryItem)
		.where(
			listIds.length === 1
				? eq(groceryItem.listId, listIds[0])
				: inArray(groceryItem.listId, listIds),
		);

	// Group items by list ID
	const itemsByListId = new Map<string, (typeof groceryItem.$inferSelect)[]>();
	for (const item of allItems) {
		if (!itemsByListId.has(item.listId)) {
			itemsByListId.set(item.listId, []);
		}
		itemsByListId.get(item.listId)?.push(item);
	}

	return lists.map((list) => ({
		...list,
		items: itemsByListId.get(list.id) || [],
	}));
}

/**
 * @deprecated Use getSupplyList instead
 * Retrieves the most recently updated grocery list for an organization.
 * Returns null if the organization has no grocery lists.
 */
export async function getLatestGroceryList(
	db: D1Database,
	organizationId: string,
) {
	const lists = await getGroceryLists(db, organizationId);
	return lists.length > 0 ? lists[0] : null;
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
				category: groceryItem.category,
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
			category: data.category || "other",
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
				category: data.category ?? existing.category,
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

	if (ingredients.length === 0) {
		return { addedItems: [], skippedItems: [] };
	}

	// Get organization's current inventory
	const orgInventory = await d1
		.select()
		.from(inventory)
		.where(eq(inventory.organizationId, organizationId));

	// Create a map for quick lookup (normalized names)
	const inventoryMap = new Map(
		orgInventory.map((item) => [
			item.name.toLowerCase().trim(),
			{ quantity: item.quantity, unit: item.unit },
		]),
	);

	const addedItems: (typeof groceryItem.$inferSelect)[] = [];
	const skippedItems: { name: string; reason: string }[] = [];

	// Check each ingredient against inventory
	for (const ingredient of ingredients) {
		const normalizedName = ingredient.ingredientName.toLowerCase().trim();
		const inventoryItem = inventoryMap.get(normalizedName);

		if (inventoryItem && inventoryItem.quantity >= ingredient.quantity) {
			// Organization has enough of this item
			skippedItems.push({
				name: ingredient.ingredientName,
				reason: "Sufficient quantity in inventory",
			});
			continue;
		}

		// Calculate needed quantity (either full amount or the difference)
		const neededQuantity = inventoryItem
			? ingredient.quantity - inventoryItem.quantity
			: ingredient.quantity;

		const itemId = crypto.randomUUID();

		await d1.insert(groceryItem).values({
			id: itemId,
			listId,
			name: ingredient.ingredientName,
			quantity: neededQuantity,
			unit: ingredient.unit,
			sourceMealId: mealId,
		});

		const [newItem] = await d1
			.select()
			.from(groceryItem)
			.where(eq(groceryItem.id, itemId));

		addedItems.push(newItem);
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
	listName?: string,
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
		// Create empty list if no meals exist
		const listId = crypto.randomUUID();
		await d1.insert(groceryList).values({
			id: listId,
			organizationId,
			name: listName || "Shopping from Meals",
		});

		const list = await getGroceryList(db, organizationId, listId);
		if (!list) throw new Error("List creation failed");
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
		})
		.from(mealIngredient)
		.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
		.where(eq(meal.organizationId, organizationId));

	if (allIngredients.length === 0) {
		// Create empty list if no ingredients
		const listId = crypto.randomUUID();
		await d1.insert(groceryList).values({
			id: listId,
			organizationId,
			name: listName || "Shopping from Meals",
		});

		const list = await getGroceryList(db, organizationId, listId);
		if (!list) throw new Error("List creation failed");
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

	// Get organization's current inventory
	const orgInventory = await d1
		.select()
		.from(inventory)
		.where(eq(inventory.organizationId, organizationId));

	// Create inventory lookup map (normalized names)
	const inventoryMap = new Map(
		orgInventory.map((item) => [
			item.name.toLowerCase().trim(),
			{ quantity: item.quantity, unit: item.unit },
		]),
	);

	// Aggregate ingredients by name (combine quantities for duplicates)
	const ingredientAggregation = new Map<
		string,
		{
			name: string;
			quantity: number;
			unit: string;
			sourceMealIds: string[];
		}
	>();

	for (const row of allIngredients) {
		const ingredient = row.meal_ingredient;
		const normalizedName = ingredient.ingredientName.toLowerCase().trim();

		if (ingredientAggregation.has(normalizedName)) {
			const existing = ingredientAggregation.get(normalizedName);
			if (!existing) continue;

			// Only aggregate if units match
			if (existing.unit === ingredient.unit) {
				existing.quantity += ingredient.quantity;
				if (!existing.sourceMealIds.includes(ingredient.mealId)) {
					existing.sourceMealIds.push(ingredient.mealId);
				}
			} else {
				// Different units - create separate entry with unit suffix
				const keyWithUnit = `${normalizedName}__${ingredient.unit}`;
				ingredientAggregation.set(keyWithUnit, {
					name: ingredient.ingredientName,
					quantity: ingredient.quantity,
					unit: ingredient.unit,
					sourceMealIds: [ingredient.mealId],
				});
			}
		} else {
			ingredientAggregation.set(normalizedName, {
				name: ingredient.ingredientName,
				quantity: ingredient.quantity,
				unit: ingredient.unit,
				sourceMealIds: [ingredient.mealId],
			});
		}
	}

	// Use the Supply list instead of creating a new one
	const supplyList = await ensureSupplyList(db, organizationId);

	if (!supplyList) {
		throw new Error("Failed to ensure supply list");
	}

	const listId = supplyList.id;

	// Create map of existing items for deduplication
	const existingItemsMap = new Map<string, typeof groceryItem.$inferSelect>();

	if (supplyList.items) {
		for (const item of supplyList.items) {
			const key = `${item.name.toLowerCase().trim()}__${item.unit}`;
			existingItemsMap.set(key, item);
		}
	}

	let addedCount = 0;
	let skippedCount = 0;

	// Collect batch operations
	const itemsToInsert: (typeof groceryItem.$inferInsert)[] = [];
	const itemsToUpdate: Array<{
		id: string;
		quantity: number;
	}> = [];

	// Check each aggregated ingredient against inventory
	for (const [, aggregated] of ingredientAggregation) {
		const normalizedName = aggregated.name.toLowerCase().trim();
		const inventoryItem = inventoryMap.get(normalizedName);

		// Skip if organization has sufficient quantity
		if (
			inventoryItem &&
			inventoryItem.unit === aggregated.unit &&
			inventoryItem.quantity >= aggregated.quantity
		) {
			skippedCount++;
			continue;
		}

		// Calculate needed quantity
		const neededQuantity =
			inventoryItem && inventoryItem.unit === aggregated.unit
				? Math.max(0, aggregated.quantity - inventoryItem.quantity)
				: aggregated.quantity;

		if (neededQuantity <= 0) {
			skippedCount++;
			continue;
		}

		// Check if item already exists in the list
		const existingKey = `${normalizedName}__${aggregated.unit}`;
		const existingItem = existingItemsMap.get(existingKey);

		if (existingItem) {
			// Queue update if quantity changed
			if (existingItem.quantity !== neededQuantity) {
				itemsToUpdate.push({
					id: existingItem.id,
					quantity: neededQuantity,
				});
			}
		} else {
			// Auto-categorize ingredient based on keywords
			const category = categorizeIngredient(aggregated.name);

			// Queue insert
			itemsToInsert.push({
				id: crypto.randomUUID(),
				listId,
				name: aggregated.name,
				quantity: neededQuantity,
				unit: aggregated.unit,
				category,
				sourceMealId: aggregated.sourceMealIds[0], // Link to first meal
			});

			addedCount++;
		}
	}

	// Execute batched operations
	const batchOperations = [];

	// Batch inserts
	if (itemsToInsert.length > 0) {
		batchOperations.push(d1.insert(groceryItem).values(itemsToInsert));
	}

	// Batch updates (Drizzle doesn't support bulk updates directly, so we batch them)
	if (itemsToUpdate.length > 0) {
		for (const update of itemsToUpdate) {
			batchOperations.push(
				d1
					.update(groceryItem)
					.set({ quantity: update.quantity })
					.where(eq(groceryItem.id, update.id)),
			);
		}
	}

	// Execute all operations in a single batch
	if (batchOperations.length > 0) {
		await d1.batch(batchOperations as [any, ...any[]]);
	}

	const list = await getGroceryList(db, organizationId, listId);
	if (!list) throw new Error("List retrieval failed");

	return {
		list,
		summary: {
			addedItems: addedCount,
			skippedItems: skippedCount,
			mealsProcessed: meals.length,
			totalIngredients: allIngredients.length,
		},
	};
}

/**
 * Simple keyword-based categorization
 */
function categorizeIngredient(name: string): string {
	const lower = name.toLowerCase();
	if (
		lower.includes("chicken") ||
		lower.includes("beef") ||
		lower.includes("pork") ||
		lower.includes("fish") ||
		lower.includes("meat")
	)
		return "protein";
	if (
		lower.includes("milk") ||
		lower.includes("cheese") ||
		lower.includes("yogurt") ||
		lower.includes("cream") ||
		lower.includes("butter")
	)
		return "dairy";
	if (
		lower.includes("apple") ||
		lower.includes("banana") ||
		lower.includes("carrot") ||
		lower.includes("lettuce") ||
		lower.includes("onion") ||
		lower.includes("potato") ||
		lower.includes("tomato") ||
		lower.includes("vegetable") ||
		lower.includes("fruit")
	)
		return "produce";
	if (
		lower.includes("bread") ||
		lower.includes("pasta") ||
		lower.includes("rice") ||
		lower.includes("flour") ||
		lower.includes("oat")
	)
		return "grains";
	if (lower.includes("can") || lower.includes("jar") || lower.includes("sauce"))
		return "canned";
	if (lower.includes("frozen") || lower.includes("ice")) return "frozen";
	return "other";
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
	for (const item of purchasedItems) {
		await d1.delete(groceryItem).where(eq(groceryItem.id, item.id));
	}

	return {
		docked: results.updated + results.created,
		summary: results,
	};
}
