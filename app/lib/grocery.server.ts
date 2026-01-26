import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	groceryItem,
	groceryList,
	inventory,
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

/**
 * Retrieves all grocery lists for a user with their items.
 */
export async function getGroceryLists(db: D1Database, userId: string) {
	const d1 = drizzle(db);

	const [lists, allItems] = await d1.batch([
		d1
			.select()
			.from(groceryList)
			.where(eq(groceryList.userId, userId))
			.orderBy(desc(groceryList.updatedAt)),
		d1
			.select()
			.from(groceryItem)
			.innerJoin(groceryList, eq(groceryItem.listId, groceryList.id))
			.where(eq(groceryList.userId, userId)),
	]);

	// Group items by list ID
	const itemsByListId = new Map<string, (typeof groceryItem.$inferSelect)[]>();
	for (const row of allItems) {
		const item = row.grocery_item;
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
