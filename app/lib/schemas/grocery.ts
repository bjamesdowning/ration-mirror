import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";

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
	quantity: z.number().int().positive().default(1),
	unit: z
		.string()
		.min(1)
		.max(50)
		.default("unit")
		.transform((v) => v.toLowerCase()),
	category: z
		.enum([
			"dry_goods",
			"cryo_frozen",
			"perishable",
			"produce",
			"canned",
			"liquid",
			"other",
		])
		.default("other"),
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
	quantity: z.number().int().positive().optional(),
	unit: z
		.string()
		.min(1)
		.max(50)
		.optional()
		.transform((v) => v?.toLowerCase()),
	category: z
		.enum([
			"dry_goods",
			"cryo_frozen",
			"perishable",
			"produce",
			"canned",
			"liquid",
			"other",
		])
		.optional(),
	domain: z.enum(ITEM_DOMAINS).optional(),
	isPurchased: z
		.union([z.boolean(), z.string().transform((val) => val === "true")])
		.optional(),
});

export const AddFromMealSchema = z.object({
	mealId: z.string().uuid(),
});

export type GroceryListInput = z.infer<typeof GroceryListSchema>;
export type GroceryItemInput = z.infer<typeof GroceryItemSchema>;
export type GroceryItemUpdateInput = z.infer<typeof GroceryItemUpdateSchema>;
