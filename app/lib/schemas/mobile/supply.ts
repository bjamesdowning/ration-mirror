import { z } from "zod";
import {
	SnoozeItemSchema,
	SupplyItemSchema,
	SupplyItemUpdateSchema,
} from "~/lib/schemas/supply";

export const MobileCreateSupplyItemSchema = SupplyItemSchema;

export const MobileUpdateSupplyItemSchema = SupplyItemUpdateSchema;

/**
 * Query params for `GET /supply` (see H-4) — bounds the item-row fetch.
 * Default limit of 200 matches the `d1-query-safety.mdc` guidance for
 * cargo-adjacent-volume endpoints.
 */
export const MobileSupplyListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(500).default(200),
	offset: z.coerce.number().int().min(0).default(0),
});

export type MobileSupplyListQuery = z.infer<typeof MobileSupplyListQuerySchema>;

export const MobileSnoozeItemSchema = SnoozeItemSchema;
