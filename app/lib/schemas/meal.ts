import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { normalizeUnitAlias } from "../units";
import { normalizeDirections, serializeDirections } from "./directions";
import { UnitSchema } from "./units";

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
	quantity: z.coerce.number().nonnegative("Quantity must be zero or greater"),
	unit: z
		.union([UnitSchema, z.string().min(1)])
		.transform((v) => normalizeUnitAlias(typeof v === "string" ? v : v)),
	cargoId: z
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
	directions: z
		.union([z.string(), z.array(z.unknown())])
		.optional()
		.transform((v): string | undefined => {
			if (v == null) return undefined;
			const steps = normalizeDirections(v);
			return steps.length > 0 ? serializeDirections(steps) : undefined;
		}),
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

/** Schema for creating/updating a provision (single-item "meal"). */
export const ProvisionSchema = z.object({
	name: z
		.string()
		.min(1, "Item name is required")
		.transform((v) => v.trim().toLowerCase()),
	domain: z.enum(ITEM_DOMAINS).default("food"),
	quantity: z.coerce.number().positive("Quantity must be greater than zero"),
	unit: z
		.union([UnitSchema, z.string().min(1)])
		.transform((v) => normalizeUnitAlias(typeof v === "string" ? v : v)),
	tags: z
		.array(z.string().transform((v) => v.toLowerCase().trim()))
		.default([]),
});

export type ProvisionInput = z.infer<typeof ProvisionSchema>;

/** Partial schema for updating a provision (all fields optional except validation). */
export const ProvisionUpdateSchema = ProvisionSchema.partial();

export type ProvisionUpdateInput = z.infer<typeof ProvisionUpdateSchema>;

/**
 * AI-generated recipe schema (e.g. from meal generation endpoint).
 * Used to parse and validate LLM output.
 * directions must have at least 4 steps, each at least 10 chars — enforces
 * the prompt contract and rejects empty/placeholder direction arrays.
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
	directions: z
		.array(
			z.string().min(10, "Each direction step must be at least 10 characters"),
		)
		.min(4, "Recipe must include at least 4 direction steps"),
	prepTime: z.number(),
	cookTime: z.number(),
});

export const AIResponseSchema = z.object({
	recipes: z.array(AIRecipeSchema).min(1),
});

export type AIResponse = z.infer<typeof AIResponseSchema>;

/** Query parameters for GET /api/meals/match */
export const MealMatchQuerySchema = z.object({
	mode: z.enum(["strict", "delta"]),
	minMatch: z.coerce.number().int().min(0).max(100).default(50),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	tag: z
		.string()
		.optional()
		.transform((v) => (v === "" || !v ? undefined : v)),
	servings: z.preprocess(
		(v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
		z.number().int().min(1).optional(),
	),
	type: z.enum(["recipe", "provision"]).optional(),
	domain: z
		.string()
		.optional()
		.transform((v) => (v === "" || !v ? undefined : v)),
});

export type MealMatchQueryInput = z.infer<typeof MealMatchQuerySchema>;

/**
 * Normalize AI output to match schema. Gemini sometimes returns:
 * - ingredients with only inventoryName (no name)
 * - directions as a flat string instead of an array
 * - numeric fields as strings
 *
 * Does NOT silently default directions to []. If directions are missing or
 * empty after normalization the recipe will fail AIRecipeSchema validation,
 * which is the desired behaviour — we want to surface bad LLM output rather
 * than store empty-direction recipes.
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

		// Directions can arrive as an array of strings, a single newline-delimited
		// string, or be missing entirely. Normalise to string[] in all cases.
		let directions: string[];
		if (Array.isArray(recipe.directions)) {
			directions = (recipe.directions as unknown[])
				.map((d) => String(d).trim())
				.filter((d) => d.length > 0);
		} else if (
			typeof recipe.directions === "string" &&
			recipe.directions.trim()
		) {
			directions = recipe.directions
				.split(/\n+/)
				.map((d) => d.replace(/^\d+\.\s*/, "").trim())
				.filter((d) => d.length > 0);
		} else {
			// Intentionally leave empty — Zod min(4) will reject this recipe.
			directions = [];
		}

		return {
			name: recipe.name ?? "Unnamed Recipe",
			description:
				recipe.description && String(recipe.description).trim()
					? String(recipe.description)
					: "No description",
			ingredients: ing,
			directions,
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
