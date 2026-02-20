import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { UnitSchema } from "./units";

export const GroceryListSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(100)
		.optional()
		.transform((v) => v?.toLowerCase()),
});

export const GroceryItemSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(200)
		.transform((v) => v.toLowerCase()),
	quantity: z.coerce.number().min(0).default(1),
	unit: UnitSchema.default("unit"),
	domain: z.enum(ITEM_DOMAINS).default("food"),
	sourceMealId: z.string().uuid().optional(),
});

export const GroceryItemUpdateSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(200)
		.optional()
		.transform((v) => v?.toLowerCase()),
	quantity: z.coerce.number().min(0).optional(),
	unit: UnitSchema.optional(),
	domain: z.enum(ITEM_DOMAINS).optional(),
	isPurchased: z
		.union([z.boolean(), z.string().transform((val) => val === "true")])
		.optional(),
});

export const SharedItemToggleSchema = z.object({
	isPurchased: z.union([
		z.boolean(),
		z.string().transform((val) => val === "true"),
	]),
});

export const AddFromMealSchema = z.object({
	mealId: z.string().uuid(),
});

/** For dock-cargo and other actions that take a list id from form/params. */
export const ListIdSchema = z.object({
	listId: z.string().uuid(),
});

export type GroceryListInput = z.infer<typeof GroceryListSchema>;
export type GroceryItemInput = z.infer<typeof GroceryItemSchema>;
export type GroceryItemUpdateInput = z.infer<typeof GroceryItemUpdateSchema>;
