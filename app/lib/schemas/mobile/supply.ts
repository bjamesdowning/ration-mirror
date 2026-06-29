import { z } from "zod";
import { SupplyItemSchema, SupplyItemUpdateSchema } from "~/lib/schemas/supply";

export const MobileCreateSupplyItemSchema = SupplyItemSchema;

export const MobileUpdateSupplyItemSchema = SupplyItemUpdateSchema;

export const MobileMealsListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	tag: z.string().optional(),
});
