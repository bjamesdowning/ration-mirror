import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { normalizeUnitAlias } from "../units";
import { normalizeDirections, serializeDirections } from "./directions";
import { UnitSchema } from "./units";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const optionalUuid = z
	.string()
	.optional()
	.transform((v) =>
		v && typeof v === "string" && v.trim() ? v.trim() : undefined,
	)
	.refine((v) => !v || UUID_REGEX.test(v), { message: "Invalid UUID format" });

const ManifestIngredientSchema = z.object({
	ingredientName: z
		.string()
		.min(1, "Ingredient name is required")
		.transform((v) => v.toLowerCase()),
	quantity: z.coerce.number().nonnegative("Quantity must be zero or greater"),
	unit: z
		.union([UnitSchema, z.string().min(1)])
		.transform((v) => normalizeUnitAlias(typeof v === "string" ? v : v)),
	isOptional: z.coerce.boolean().default(false),
	orderIndex: z.coerce.number().default(0),
});

/** Recipe meal in manifest format (has ingredients). */
export const ManifestRecipeSchema = z.object({
	id: optionalUuid,
	name: z
		.string()
		.min(1, "Meal name is required")
		.transform((v) => v.toLowerCase()),
	type: z.literal("recipe"),
	domain: z.enum(ITEM_DOMAINS).default("food"),
	description: z.string().optional(),
	directions: z
		.union([z.string(), z.array(z.unknown())])
		.optional()
		.transform((v): string | undefined => {
			if (v == null) return undefined;
			if (typeof v === "string") return v || undefined;
			// RecipeStep[] — serialize back to JSON string for manifest portability
			const steps = normalizeDirections(v);
			return steps.length > 0 ? serializeDirections(steps) : undefined;
		}),
	equipment: z.array(z.string()).default([]),
	servings: z.coerce.number().int().min(1).default(1),
	prepTime: z.coerce.number().int().nonnegative().optional(),
	cookTime: z.coerce.number().int().nonnegative().optional(),
	ingredients: z.array(ManifestIngredientSchema).default([]),
	tags: z.array(z.string().transform((v) => v.toLowerCase())).default([]),
});

/** Provision meal in manifest format (single-item, no ingredients array). */
export const ManifestProvisionSchema = z.object({
	id: optionalUuid,
	name: z
		.string()
		.min(1, "Item name is required")
		.transform((v) => v.trim().toLowerCase()),
	type: z.literal("provision"),
	domain: z.enum(ITEM_DOMAINS).default("food"),
	quantity: z.coerce.number().positive("Quantity must be greater than zero"),
	unit: z
		.union([UnitSchema, z.string().min(1)])
		.transform((v) => normalizeUnitAlias(typeof v === "string" ? v : v)),
	tags: z
		.array(z.string().transform((v) => v.toLowerCase().trim()))
		.default([]),
});

/** Union of recipe and provision meal in manifest format. */
export const ManifestMealSchema = z.discriminatedUnion("type", [
	ManifestRecipeSchema,
	ManifestProvisionSchema,
]);

export type ManifestMeal = z.infer<typeof ManifestMealSchema>;
export type ManifestRecipe = z.infer<typeof ManifestRecipeSchema>;
export type ManifestProvision = z.infer<typeof ManifestProvisionSchema>;

/** Full galley manifest for import/export. */
export const GalleyManifestSchema = z.object({
	version: z.literal(1).default(1),
	exportedAt: z.string().datetime().optional(),
	meals: z.array(ManifestMealSchema).default([]),
});

export type GalleyManifest = z.infer<typeof GalleyManifestSchema>;
