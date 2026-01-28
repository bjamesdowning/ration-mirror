import { z } from "zod";

export const MealIngredientSchema = z.object({
	ingredientName: z
		.string()
		.min(1, "Ingredient name is required")
		.transform((v) => v.toLowerCase()),
	quantity: z.coerce.number().positive("Quantity must be positive"),
	unit: z
		.string()
		.min(1, "Unit is required")
		.transform((v) => v.toLowerCase()),
	inventoryId: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v === "" ? null : v)),
	isOptional: z.coerce.boolean().default(false),
	orderIndex: z.coerce.number().default(0),
});

const MIN_SERVINGS = 1;
const DEFAULT_SERVINGS = 1;

export const MealSchema = z.object({
	name: z
		.string()
		.min(1, "Meal name is required")
		.transform((v) => v.toLowerCase()),
	description: z.string().optional(),
	directions: z.string().optional(),
	equipment: z.array(z.string()).default([]),
	servings: z.coerce.number().int().min(MIN_SERVINGS).default(DEFAULT_SERVINGS),
	prepTime: z.coerce.number().int().nonnegative().optional(),
	cookTime: z.coerce.number().int().nonnegative().optional(),
	customFields: z.record(z.string(), z.string()).default({}),
	ingredients: z.array(MealIngredientSchema).default([]),
	tags: z.array(z.string().transform((v) => v.toLowerCase())).default([]),
});

export type MealInput = z.infer<typeof MealSchema>;
export type MealIngredientInput = z.infer<typeof MealIngredientSchema>;
