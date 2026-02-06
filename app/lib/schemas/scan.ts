import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { INVENTORY_CATEGORIES } from "../inventory";

/**
 * Schema for individual scanned items
 */
export const ScanResultItemSchema = z.object({
	id: z.string().uuid(), // Temporary UUID for UI state management
	name: z.string().min(1, "Item name is required"),
	quantity: z.number().min(0, "Quantity must be positive"),
	unit: z.enum(["kg", "g", "lb", "oz", "l", "ml", "unit", "can", "pack"]),
	category: z.enum(INVENTORY_CATEGORIES).optional(),
	domain: z.enum(ITEM_DOMAINS).default("food"),
	tags: z.array(z.string()).default([]),
	expiresAt: z.string().optional(), // ISO date string
	selected: z.boolean().default(true), // Default to selected for batch add
	confidence: z.number().min(0).max(1).optional(), // AI confidence score 0-1
	rawText: z.string().optional(), // Original text from receipt for debugging
});

export type ScanResultItem = z.infer<typeof ScanResultItemSchema>;

/**
 * Schema for complete scan results
 */
export const ScanResultSchema = z.object({
	items: z.array(ScanResultItemSchema),
	metadata: z.object({
		source: z.enum(["image", "pdf", "csv", "json"]),
		filename: z.string().optional(),
		processedAt: z.string(), // ISO timestamp
		confidence: z.number().min(0).max(1).optional(), // Overall confidence
	}),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;

/**
 * Schema for batch adding items to inventory
 */
export const BatchAddInventorySchema = z.object({
	items: z.array(
		z.object({
			name: z.string().min(1),
			quantity: z.number().min(0),
			unit: z.enum(["kg", "g", "lb", "oz", "l", "ml", "unit", "can", "pack"]),
			category: z.enum(INVENTORY_CATEGORIES).default("other"),
			domain: z.enum(ITEM_DOMAINS).default("food"),
			tags: z.array(z.string()).default([]),
			expiresAt: z.coerce.date().optional(),
		}),
	),
});

export type BatchAddInventoryInput = z.infer<typeof BatchAddInventorySchema>;
