import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { type groceryItem, inventory, ledger } from "../db/schema";
import { INVENTORY_CATEGORIES } from "./inventory";

// --- Validation Schemas ---

export const InventoryItemSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.transform((v) => v.toLowerCase()),
	quantity: z.coerce.number().min(0, "Quantity must be positive"), // coerce handles string->number from forms
	unit: z.enum(["kg", "g", "lb", "oz", "l", "ml", "unit", "can", "pack"]),
	category: z.enum(INVENTORY_CATEGORIES).default("other"),
	tags: z.array(z.string().transform((v) => v.toLowerCase())).default([]),
	expiresAt: z.coerce.date().optional(), // Optional date string coercion
});

export type InventoryItemInput = z.infer<typeof InventoryItemSchema>;
export type InventoryItemUpdateInput = Partial<InventoryItemInput>;

export function calculateInventoryStatus(expiresAt?: Date | null) {
	if (!expiresAt) return "stable";
	const msPerDay = 1000 * 60 * 60 * 24;
	const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / msPerDay;
	if (daysUntilExpiry < 0) return "biohazard";
	if (daysUntilExpiry < 3) return "decay_imminent";
	return "stable";
}

function normalizeTags(tags: unknown) {
	if (Array.isArray(tags)) {
		return tags.filter((tag) => typeof tag === "string") as string[];
	}
	if (typeof tags === "string") {
		try {
			const parsed = JSON.parse(tags);
			if (Array.isArray(parsed)) {
				return parsed.filter((tag) => typeof tag === "string") as string[];
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

// --- Database Operations ---

/**
 * Fetch all inventory items for a specific organization.
 * Ordered by creation date descending (newest first).
 */
export async function getInventory(db: D1Database, organizationId: string) {
	const d1 = drizzle(db);

	return await d1
		.select()
		.from(inventory)
		.where(eq(inventory.organizationId, organizationId))
		.orderBy(desc(inventory.createdAt));
}

/**
 * Add a new item to the organization's inventory.
 * Triggers an asynchronous vector embedding update.
 */
export async function addItem(
	env: Env,
	organizationId: string,
	data: InventoryItemInput,
) {
	const d1 = drizzle(env.DB);

	const [newItem] = await d1
		.insert(inventory)
		.values({
			organizationId,
			name: data.name,
			quantity: data.quantity,
			unit: data.unit,
			category: data.category,
			status: calculateInventoryStatus(data.expiresAt),
			tags: data.tags,
			expiresAt: data.expiresAt,
			updatedAt: new Date(),
		})
		.returning();

	// Fire-and-forget vector update (or await if strict consistency needed)
	// We await it here to ensure it's done before returning, but catch errors to not fail the user action

	return [newItem];
}

/**
 * Update an existing inventory item.
 * Security: Ensures the item belongs to the organization.
 * Also updates the vector embedding for semantic search.
 */
export async function updateItem(
	env: Env,
	organizationId: string,
	itemId: string,
	data: InventoryItemUpdateInput,
) {
	const d1 = drizzle(env.DB);

	const [existing] = await d1
		.select()
		.from(inventory)
		.where(
			and(
				eq(inventory.id, itemId),
				eq(inventory.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!existing) {
		return null;
	}

	const nextTags =
		data.tags !== undefined ? data.tags : normalizeTags(existing.tags);
	const nextExpiresAt =
		data.expiresAt !== undefined ? data.expiresAt : existing.expiresAt;
	const nextCategory =
		data.category ??
		(existing.category as InventoryItemInput["category"]) ??
		"other";
	const nextName = data.name ?? existing.name;
	const nextQuantity = data.quantity ?? existing.quantity;
	const nextUnit = data.unit ?? (existing.unit as InventoryItemInput["unit"]);
	const nextStatus = calculateInventoryStatus(nextExpiresAt);
	const nextData: InventoryItemInput = {
		name: nextName,
		quantity: nextQuantity,
		unit: nextUnit,
		category: nextCategory,
		tags: nextTags,
		expiresAt: nextExpiresAt ?? undefined,
	};

	const [updatedItem] = await d1
		.update(inventory)
		.set({
			name: nextData.name,
			quantity: nextData.quantity,
			unit: nextData.unit,
			category: nextData.category,
			status: nextStatus,
			tags: nextData.tags,
			expiresAt: nextData.expiresAt,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(inventory.id, itemId),
				eq(inventory.organizationId, organizationId),
			),
		)
		.returning();

	// Update vector embedding if item was found and updated

	return updatedItem;
}

/**
 * Delete (Jettison) an item from the inventory.
 * Security: Ensures the item belongs to the organization.
 */
export async function jettisonItem(
	db: D1Database,
	organizationId: string,
	itemId: string,
) {
	const d1 = drizzle(db);

	return await d1
		.delete(inventory)
		.where(
			and(
				eq(inventory.id, itemId),
				eq(inventory.organizationId, organizationId),
			),
		);
}

/**
 * Fetch inventory items that are expiring within the specified number of days.
 * Returns items ordered by expiration date (soonest first).
 *
 * @param db - D1 Database instance
 * @param organizationId - Organization ID to filter inventory
 * @param daysUntilExpiry - Number of days to look ahead (default: 7)
 * @param limit - Maximum number of items to return (default: 10)
 */
export async function getExpiringItems(
	db: D1Database,
	organizationId: string,
	daysUntilExpiry = 7,
	limit = 10,
) {
	const d1 = drizzle(db);

	const now = new Date();
	const futureDate = new Date(
		now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000,
	);

	return await d1
		.select()
		.from(inventory)
		.where(
			and(
				eq(inventory.organizationId, organizationId),
				isNotNull(inventory.expiresAt),
				lte(inventory.expiresAt, futureDate),
				gte(inventory.expiresAt, now), // Only items not yet expired
			),
		)
		.orderBy(asc(inventory.expiresAt))
		.limit(limit);
}

/**
 * Get a count summary of inventory for the dashboard.
 *
 * @param db - D1 Database instance
 * @param organizationId - Organization ID to filter inventory
 */
export async function getInventoryStats(
	db: D1Database,
	organizationId: string,
) {
	const d1 = drizzle(db);

	const items = await d1
		.select()
		.from(inventory)
		.where(eq(inventory.organizationId, organizationId));

	const now = new Date();
	const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

	const expiringCount = items.filter(
		(item) =>
			item.expiresAt && item.expiresAt >= now && item.expiresAt <= sevenDaysOut,
	).length;

	const expiredCount = items.filter(
		(item) => item.expiresAt && item.expiresAt < now,
	).length;

	return {
		totalItems: items.length,
		expiringCount,
		expiredCount,
	};
}

/**
 * Docks purchased grocery items into the inventory.
 * - Matches existing items by name and unit (case-insensitive).
 * - Increments quantity for matches.
 * - Creates new items for non-matches.
 * - Logs to ledger.
 */
export async function dockGroceryItems(
	db: D1Database,
	organizationId: string,
	items: (typeof groceryItem.$inferSelect)[],
) {
	const d1 = drizzle(db);
	const results = {
		updated: 0,
		created: 0,
	};

	// 1. Get current inventory for matching
	const currentInventory = await d1
		.select()
		.from(inventory)
		.where(eq(inventory.organizationId, organizationId));

	// Create map for case-insensitive matching: "name|unit" -> InventoryItem
	const inventoryMap = new Map<string, typeof inventory.$inferSelect>();
	for (const item of currentInventory) {
		const key = `${item.name.toLowerCase().trim()}|${item.unit.toLowerCase()}`;
		inventoryMap.set(key, item);
	}

	// 2. Collect all operations for batching
	const batchOps = [];
	const now = new Date();

	for (const item of items) {
		const key = `${item.name.toLowerCase().trim()}|${item.unit.toLowerCase()}`;
		const existing = inventoryMap.get(key);

		if (existing) {
			// Queue update for existing item
			batchOps.push(
				d1
					.update(inventory)
					.set({
						quantity: existing.quantity + item.quantity,
						updatedAt: now,
					})
					.where(eq(inventory.id, existing.id)),
			);

			// Update local map in case duplicates in list
			existing.quantity += item.quantity;
			results.updated++;
		} else {
			// Queue insert for new item
			const newItemId = crypto.randomUUID();

			batchOps.push(
				d1.insert(inventory).values({
					id: newItemId,
					organizationId,
					name: item.name,
					quantity: item.quantity,
					unit: item.unit,
					category: item.category,
					status: "stable",
					tags: [], // No tags from grocery list currently
					createdAt: now,
					updatedAt: now,
				}),
			);

			// Add to map for subsequent items in same batch
			inventoryMap.set(key, {
				id: newItemId,
				organizationId,
				name: item.name,
				quantity: item.quantity,
				unit: item.unit,
				category: item.category,
				status: "stable",
				tags: "[]",
				expiresAt: null,
				createdAt: now,
				updatedAt: now,
			});
			results.created++;
		}

		// Queue ledger entry
		batchOps.push(
			d1.insert(ledger).values({
				organizationId,
				amount: 0, // No monetary tracking yet
				reason: `dock: ${item.name} (+${item.quantity} ${item.unit})`,
			}),
		);
	}

	// 3. Execute all operations atomically in a single batch
	if (batchOps.length > 0) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(batchOps as [any, ...any[]]);
	}

	return results;
}
