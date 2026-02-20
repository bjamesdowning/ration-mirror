import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { UnitSchema } from "./units";

/**
 * Schema for individual scanned items
 */
export const ScanResultItemSchema = z.object({
	id: z.string().uuid(), // Temporary UUID for UI state management
	name: z.string().min(1, "Item name is required"),
	quantity: z.number().min(0, "Quantity must be positive"),
	unit: UnitSchema,
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
 * Schema for batch adding items to cargo
 */
export const BatchAddCargoSchema = z.object({
	items: z.array(
		z.object({
			name: z.string().min(1),
			quantity: z.number().min(0),
			unit: UnitSchema,
			domain: z.enum(ITEM_DOMAINS).default("food"),
			tags: z.array(z.string()).default([]),
			expiresAt: z.coerce.date().optional(),
			mergeTargetId: z.string().uuid().optional(),
		}),
	),
});

export type BatchAddCargoInput = z.infer<typeof BatchAddCargoSchema>;

import { normalizeUnitAlias, SUPPORTED_UNITS } from "../units";

/** Re-export for scan API prompt and other consumers */
export const SCAN_UNITS = SUPPORTED_UNITS;

/**
 * Schema for a single item in AI scan response (image/receipt parsing).
 * Unit accepts aliases (e.g. "cups", "grams") and normalizes to canonical form.
 */
export const ScanAIItemSchema = z.object({
	name: z.string().min(1),
	quantity: z.number().optional(),
	unit: z
		.string()
		.optional()
		.transform((v) => (v ? normalizeUnitAlias(v) : "unit")),
	tags: z.array(z.string()).optional(),
	expiresAt: z.union([z.string(), z.null()]).optional(),
});

/**
 * Schema for full AI scan response.
 */
export const ScanAIResponseSchema = z.object({
	items: z.array(ScanAIItemSchema).default([]),
});
