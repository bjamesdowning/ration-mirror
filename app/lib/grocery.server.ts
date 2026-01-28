import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	groceryItem,
	groceryList,
	inventory,
	meal,
	mealIngredient,
} from "../db/schema";

const SHARE_TOKEN_EXPIRY_DAYS = 7;
const SHARE_TOKEN_EXPIRY_SECONDS = SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

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
 * Retrieves all grocery lists for a user with their items.
 */
export async function getGroceryLists(db: D1Database, userId: string) {
	const d1 = drizzle(db);

	// First get all lists for this user
	const lists = await d1
		.select()
		.from(groceryList)
		.where(eq(groceryList.userId, userId))
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
 * Retrieves the most recently updated grocery list for a user.
 * Returns null if the user has no grocery lists.
 */
export async function getLatestGroceryList(db: D1Database, userId: string) {
	const lists = await getGroceryLists(db, userId);
	return lists.length > 0 ? lists[0] : null;
}

/**
 * Retrieves a single grocery list by ID with all its items.
 */
export async function getGroceryList(
	db: D1Database,
	userId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	const [lists, items] = await d1.batch([
		d1
			.select()
			.from(groceryList)
			.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId))),
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
 * Retrieves a grocery list by share token (public access - no userId verification).
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
 * Creates a new grocery list for a user.
 */
export async function createGroceryList(
	db: D1Database,
	userId: string,
	data?: GroceryListInput,
) {
	const d1 = drizzle(db);
	const listId = crypto.randomUUID();

	await d1.insert(groceryList).values({
		id: listId,
		userId,
		name: data?.name || "Shopping List",
	});

	return await getGroceryList(db, userId, listId);
}

/**
 * Updates a grocery list's metadata.
 */
export async function updateGroceryList(
	db: D1Database,
	userId: string,
	listId: string,
	data: GroceryListInput,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [existing] = await d1
		.select()
		.from(groceryList)
		.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId)));

	if (!existing) throw new Error("Grocery list not found or unauthorized");

	await d1
		.update(groceryList)
		.set({
			name: data.name || existing.name,
			updatedAt: new Date(),
		})
		.where(eq(groceryList.id, listId));

	return await getGroceryList(db, userId, listId);
}

/**
 * Deletes a grocery list and all its items (cascade).
 */
export async function deleteGroceryList(
	db: D1Database,
	userId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	return await d1
		.delete(groceryList)
		.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId)));
}

/**
 * Adds an item to a grocery list.
 */
export async function addGroceryItem(
	db: D1Database,
	userId: string,
	listId: string,
	data: GroceryItemInput,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId)));

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
	userId: string,
	listId: string,
	itemId: string,
	data: Partial<GroceryItemInput & { isPurchased?: boolean }>,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId)));

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
	userId: string,
	listId: string,
	itemId: string,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId)));

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
	userId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId)));

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
	userId: string,
	listId: string,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId)));

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
 * This performs inventory matching to only add items the user doesn't have.
 */
export async function addItemsFromMeal(
	db: D1Database,
	userId: string,
	listId: string,
	mealId: string,
) {
	const d1 = drizzle(db);

	// Verify list ownership
	const [list] = await d1
		.select()
		.from(groceryList)
		.where(and(eq(groceryList.id, listId), eq(groceryList.userId, userId)));

	if (!list) throw new Error("Grocery list not found or unauthorized");

	// Get meal ingredients
	const ingredients = await d1
		.select()
		.from(mealIngredient)
		.where(eq(mealIngredient.mealId, mealId));

	if (ingredients.length === 0) {
		return { addedItems: [], skippedItems: [] };
	}

	// Get user's current inventory
	const userInventory = await d1
		.select()
		.from(inventory)
		.where(eq(inventory.userId, userId));

	// Create a map for quick lookup (normalized names)
	const inventoryMap = new Map(
		userInventory.map((item) => [
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
			// User has enough of this item
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
 * Creates a grocery list from ALL user meals with missing ingredients.
 * Aggregates ingredients across meals and deduplicates by name.
 * Only adds items that are missing or insufficient in inventory.
 */
export async function createGroceryListFromAllMeals(
	db: D1Database,
	userId: string,
	listName?: string,
): Promise<{
	list: ReturnType<typeof getGroceryList> extends Promise<infer T> ? T : never;
	summary: GenerationSummary;
}> {
	const d1 = drizzle(db);

	// Get all user meals
	const meals = await d1
		.select({ id: meal.id })
		.from(meal)
		.where(eq(meal.userId, userId));

	if (meals.length === 0) {
		// Create empty list if no meals exist
		const listId = crypto.randomUUID();
		await d1.insert(groceryList).values({
			id: listId,
			userId,
			name: listName || "Shopping from Meals",
		});

		const list = await getGroceryList(db, userId, listId);
		return {
			list: list!,
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
		.select()
		.from(mealIngredient)
		.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
		.where(eq(meal.userId, userId));

	if (allIngredients.length === 0) {
		// Create empty list if no ingredients
		const listId = crypto.randomUUID();
		await d1.insert(groceryList).values({
			id: listId,
			userId,
			name: listName || "Shopping from Meals",
		});

		const list = await getGroceryList(db, userId, listId);
		return {
			list: list!,
			summary: {
				addedItems: 0,
				skippedItems: 0,
				mealsProcessed: meals.length,
				totalIngredients: 0,
			},
		};
	}

	// Get user's current inventory
	const userInventory = await d1
		.select()
		.from(inventory)
		.where(eq(inventory.userId, userId));

	// Create inventory lookup map (normalized names)
	const inventoryMap = new Map(
		userInventory.map((item) => [
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
			const existing = ingredientAggregation.get(normalizedName)!;
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

	// Create the grocery list
	const listId = crypto.randomUUID();
	await d1.insert(groceryList).values({
		id: listId,
		userId,
		name: listName || "Shopping from Meals",
	});

	let addedCount = 0;
	let skippedCount = 0;

	// Check each aggregated ingredient against inventory
	for (const [, aggregated] of ingredientAggregation) {
		const normalizedName = aggregated.name.toLowerCase().trim();
		const inventoryItem = inventoryMap.get(normalizedName);

		// Skip if user has sufficient quantity
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

		// Auto-categorize ingredient based on keywords
		const category = categorizeIngredient(aggregated.name);

		// Add to grocery list
		await d1.insert(groceryItem).values({
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

	const list = await getGroceryList(db, userId, listId);

	return {
		list: list!,
		summary: {
			addedItems: addedCount,
			skippedItems: skippedCount,
			mealsProcessed: meals.length,
			totalIngredients: ingredientAggregation.size,
		},
	};
}

/**
 * Auto-categorizes an ingredient based on keywords.
 */
function categorizeIngredient(name: string): string {
	const lower = name.toLowerCase();

	// Produce
	if (
		/apple|banana|orange|tomato|lettuce|carrot|onion|garlic|potato|pepper|fruit|vegetable/.test(
			lower,
		)
	) {
		return "produce";
	}

	// Perishable (dairy, meat, eggs)
	if (
		/milk|cheese|yogurt|butter|cream|egg|chicken|beef|pork|fish|salmon|turkey|bacon|sausage/.test(
			lower,
		)
	) {
		return "perishable";
	}

	// Frozen
	if (/frozen|ice cream/.test(lower)) {
		return "cryo_frozen";
	}

	// Dry goods
	if (
		/rice|pasta|flour|sugar|salt|spice|grain|cereal|oat|quinoa|bread|cookie/.test(
			lower,
		)
	) {
		return "dry_goods";
	}

	// Canned
	if (/canned|can of|jarred/.test(lower)) {
		return "canned";
	}

	// Liquid
	if (/water|juice|soda|wine|beer|broth|stock|oil|vinegar|sauce/.test(lower)) {
		return "liquid";
	}

	return "other";
}
