import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { UnitSchema } from "./units";

/**
 * Schema for a single cargo row from CSV (used after parseInventoryCsv for API validation).
 */
export const CargoCsvRowSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().min(1),
	quantity: z.number().min(0),
	unit: UnitSchema,
	domain: z.enum(ITEM_DOMAINS).default("food"),
	tags: z.array(z.string()).default([]),
	expiresAt: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

export type CargoCsvRow = z.infer<typeof CargoCsvRowSchema>;

/**
 * Schema for the full parsed import payload (array of rows).
 */
export const CargoImportPayloadSchema = z.object({
	items: z.array(CargoCsvRowSchema).max(500),
});

export type CargoImportPayload = z.infer<typeof CargoImportPayloadSchema>;
