import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";

/** Rejects common prompt injection patterns before user customization reaches the LLM */
export const INJECTION_PATTERNS =
	/(?:ignore|forget|disregard)\s+(?:previous|above|all)|(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be)|(?:system\s*:|<\/?(?:system|user|assistant)>)|```/i;

/** Request body schema for meal generation API. Validates and sanitizes customization. */
export const MealGenerateRequestSchema = z
	.object({
		customization: z
			.string()
			.max(200, "Customization must be 200 characters or less")
			.optional()
			.transform((v) => {
				if (!v || typeof v !== "string") return undefined;
				const sanitized = v
					.split("")
					.filter((c) => {
						const code = c.charCodeAt(0);
						return (code >= 32 && code !== 127) || code === 9;
					})
					.join("")
					.replace(/\s+/g, " ")
					.trim();
				return sanitized.length > 0 ? sanitized : undefined;
			}),
	})
	.refine(
		(data) => {
			const c = data.customization;
			return !c || !INJECTION_PATTERNS.test(c);
		},
		{ message: "Invalid customization text", path: ["customization"] },
	);

export type MealGenerateRequest = z.infer<typeof MealGenerateRequestSchema>;

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
	domain: z.enum(ITEM_DOMAINS).default("food"),
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

/**
 * AI-generated recipe schema (e.g. from meal generation endpoint).
 * Used to parse and validate LLM output.
 */
export const AIRecipeSchema = z.object({
	name: z.string().min(1),
	description: z.string().min(1),
	ingredients: z.array(
		z.object({
			name: z.string().min(1),
			quantity: z.number(),
			unit: z.string().min(1),
			inventoryName: z.string().min(1),
		}),
	),
	directions: z.array(z.string().min(1)),
	prepTime: z.number(),
	cookTime: z.number(),
});

export const AIResponseSchema = z.object({
	recipes: z.array(AIRecipeSchema).min(1),
});

export type AIResponse = z.infer<typeof AIResponseSchema>;

/**
 * Normalize AI output to match schema. Gemini often returns:
 * - ingredients with only inventoryName (no name)
 * - recipes without directions, prepTime, cookTime
 */
export function normalizeAIResponse(parsed: unknown): unknown {
	if (!parsed || typeof parsed !== "object") return parsed;
	const obj = parsed as { recipes?: Array<Record<string, unknown>> };
	if (!Array.isArray(obj.recipes)) return parsed;

	const recipes = obj.recipes.map((recipe) => {
		const ing = Array.isArray(recipe.ingredients)
			? (recipe.ingredients as Array<Record<string, unknown>>).map(
					(i: Record<string, unknown>) => ({
						name: i.name ?? i.inventoryName ?? "unknown",
						quantity:
							typeof i.quantity === "number"
								? i.quantity
								: Number(i.quantity) || 1,
						unit: String(i.unit ?? "unit"),
						inventoryName: i.inventoryName ?? i.name ?? "unknown",
					}),
				)
			: [];
		return {
			name: recipe.name ?? "Unnamed Recipe",
			description:
				recipe.description && String(recipe.description).trim()
					? String(recipe.description)
					: "No description",
			ingredients: ing,
			directions: Array.isArray(recipe.directions) ? recipe.directions : [],
			prepTime:
				typeof recipe.prepTime === "number"
					? recipe.prepTime
					: Number(recipe.prepTime) || 0,
			cookTime:
				typeof recipe.cookTime === "number"
					? recipe.cookTime
					: Number(recipe.cookTime) || 0,
		};
	});
	return { recipes };
}
