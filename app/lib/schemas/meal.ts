import { z } from "zod";

export const MealIngredientSchema = z.object({
	ingredientName: z.string().min(1, "Ingredient name is required"),
	quantity: z.coerce.number().positive("Quantity must be positive"),
	unit: z.string().min(1, "Unit is required"),
	inventoryId: z.string().optional().nullable(),
	isOptional: z.boolean().default(false),
	orderIndex: z.number().default(0),
});

const MIN_SERVINGS = 1;
const DEFAULT_SERVINGS = 1;

export const MealSchema = z.object({
	name: z.string().min(1, "Meal name is required"),
	description: z.string().optional(),
	directions: z.string().optional(),
	equipment: z.array(z.string()).default([]),
	servings: z.coerce.number().int().min(MIN_SERVINGS).default(DEFAULT_SERVINGS),
	prepTime: z.coerce.number().int().nonnegative().optional(),
	cookTime: z.coerce.number().int().nonnegative().optional(),
	customFields: z.record(z.string(), z.string()).default({}),
	ingredients: z.array(MealIngredientSchema).default([]),
	tags: z.array(z.string()).default([]),
});

export type MealInput = z.infer<typeof MealSchema>;
export type MealIngredientInput = z.infer<typeof MealIngredientSchema>;
