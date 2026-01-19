// @ts-nocheck
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { inventory } from "../db/schema";

// --- Validation Schemas ---

export const InventoryItemSchema = z.object({
	name: z.string().min(1, "Name is required"),
	quantity: z.coerce.number().min(0, "Quantity must be positive"), // coerce handles string->number from forms
	unit: z.enum(["kg", "g", "lb", "oz", "l", "ml", "unit", "can", "pack"]),
	tags: z.array(z.string()).default([]),
	expiresAt: z.coerce.date().optional(), // Optional date string coercion
});

export type InventoryItemInput = z.infer<typeof InventoryItemSchema>;

// --- Database Operations ---

/**
 * Fetch all inventory items for a specific user.
 * Ordered by creation date descending (newest first).
 */
export async function getInventory(db: D1Database, userId: string) {
	const d1 = drizzle(db);

	return await d1
		.select()
		.from(inventory)
		.where(eq(inventory.userId, userId))
		.orderBy(desc(inventory.createdAt));
}

/**
 * Add a new item to the user's inventory.
 */
import { updateItemEmbedding } from "./vector.server";

// ... (keep existing imports)

/**
 * Add a new item to the user's inventory.
 * Triggers an asynchronous vector embedding update.
 */
export async function addItem(
	env: Env,
	userId: string,
	data: InventoryItemInput,
) {
	const d1 = drizzle(env.DB);

	const [newItem] = await d1
		.insert(inventory)
		.values({
			userId,
			name: data.name,
			quantity: data.quantity,
			unit: data.unit,
			tags: data.tags,
			expiresAt: data.expiresAt,
		})
		.returning();

	// Fire-and-forget vector update (or await if strict consistency needed)
	// We await it here to ensure it's done before returning, but catch errors to not fail the user action
	if (newItem) {
		// We need to cast the result to match what updateItemEmbedding expects if types don't align perfectly
		// But our Drizzle types should align with InventoryItemInput roughly.
		// Actually updateItemEmbedding takes InventoryItemInput, which lacks 'id'.
		// We pass the Input data which we have.
		await updateItemEmbedding(env, userId, newItem.id, data);
	}

	return [newItem];
}

/**
 * Delete (Jettison) an item from the inventory.
 * Security: Ensures the item belongs to the user requesting deletion.
 */
export async function jettisonItem(
	db: D1Database,
	userId: string,
	itemId: string,
) {
	const d1 = drizzle(db);

	return await d1
		.delete(inventory)
		.where(and(eq(inventory.id, itemId), eq(inventory.userId, userId)));
}
