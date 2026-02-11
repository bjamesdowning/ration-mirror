import { z } from "zod";

/** Request body schema for recipe import API. HTTPS-only URLs. */
export const RecipeImportRequestSchema = z.object({
	url: z
		.string()
		.url("Must be a valid URL")
		.max(2048)
		.refine((u) => u.startsWith("https://"), "Only HTTPS URLs are allowed"),
});

export type RecipeImportRequest = z.infer<typeof RecipeImportRequestSchema>;

/**
 * JSON Schema for Workers AI response_format.json_schema.
 * Plain object, not Zod — passed to env.AI.run().
 */
export const RECIPE_IMPORT_JSON_SCHEMA = {
	type: "object",
	properties: {
		status: { type: "string", enum: ["ok", "error"] },
		title: { type: "string" },
		description: { type: "string" },
		ingredients: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string" },
					quantity: { type: "number" },
					unit: { type: "string" },
					isOptional: { type: "boolean" },
				},
				required: ["name", "quantity", "unit"],
			},
		},
		steps: { type: "array", items: { type: "string" } },
		prepTime: { type: "number" },
		cookTime: { type: "number" },
		servings: { type: "number" },
		tags: { type: "array", items: { type: "string" } },
		equipment: { type: "array", items: { type: "string" } },
		code: {
			type: "string",
			enum: ["NOT_A_RECIPE", "CONTENT_TOO_SHORT", "EXTRACTION_FAILED"],
		},
		message: { type: "string" },
	},
	// When status is "ok", model must include ingredients and steps; when status is "error", use [] for both.
	required: ["status", "ingredients", "steps"],
} as const;

/** Zod schema for AI success response (semantic validation). */
export const RecipeImportAISuccessSchema = z.object({
	status: z.literal("ok"),
	title: z.string().min(1),
	description: z.string().optional().default(""),
	ingredients: z
		.array(
			z.object({
				name: z.string().min(1),
				quantity: z.number().nonnegative(), // 0 allowed for "to taste", "pinch", etc.
				unit: z.string().min(1),
				isOptional: z.boolean().optional().default(false),
			}),
		)
		.min(1),
	steps: z.array(z.string().min(1)).min(1),
	prepTime: z.number().nonnegative().optional().default(0),
	cookTime: z.number().nonnegative().optional().default(0),
	servings: z.number().int().positive().optional().default(1),
	tags: z.array(z.string()).optional().default([]),
	equipment: z.array(z.string()).optional().default([]),
});

/** Zod schema for AI error response. */
export const RecipeImportAIErrorSchema = z.object({
	status: z.literal("error"),
	code: z.enum(["NOT_A_RECIPE", "CONTENT_TOO_SHORT", "EXTRACTION_FAILED"]),
	message: z.string(),
});

/** Discriminated union for full AI response validation. */
export const RecipeImportAIResponseSchema = z.discriminatedUnion("status", [
	RecipeImportAISuccessSchema,
	RecipeImportAIErrorSchema,
]);

export type RecipeImportAISuccess = z.infer<typeof RecipeImportAISuccessSchema>;
export type RecipeImportAIError = z.infer<typeof RecipeImportAIErrorSchema>;
export type RecipeImportAIResponse = z.infer<
	typeof RecipeImportAIResponseSchema
>;
