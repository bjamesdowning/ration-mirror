import { z } from "zod";
import { normalizeUnitAlias } from "../units";

/** Max client-supplied HTML size (matches consumer MAX_HTML_BYTES). */
export const RECIPE_IMPORT_PAGE_HTML_MAX = 1_000_000;
export const RECIPE_IMPORT_PAGE_HTML_MIN = 200;

/** Photo / screenshot import limits. */
export const RECIPE_IMPORT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const RECIPE_IMPORT_PHOTO_MIME = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

const httpsUrlSchema = z
	.string()
	.url("Must be a valid URL")
	.max(2048)
	.refine((u) => u.startsWith("https://"), "Only HTTPS URLs are allowed");

/** Request body schema for recipe import API (URL, social, and/or photo). */
export const RecipeImportRequestSchema = z
	.object({
		url: httpsUrlSchema.optional(),
		/** Optional page HTML from client-assisted capture (iOS / web paste). */
		pageHtml: z
			.string()
			.min(
				RECIPE_IMPORT_PAGE_HTML_MIN,
				"Page HTML is too short to extract a recipe",
			)
			.refine(
				(s) =>
					new TextEncoder().encode(s).byteLength <= RECIPE_IMPORT_PAGE_HTML_MAX,
				"Page HTML is too large to process",
			)
			.optional(),
		/** Optional caption / share text (Instagram). */
		userText: z.string().max(8_000).optional(),
		/** Base64-encoded recipe photo / screenshot (no data: prefix). */
		photoBase64: z.string().min(32).max(7_000_000).optional(),
		photoMimeType: z.enum(RECIPE_IMPORT_PHOTO_MIME).optional(),
	})
	.superRefine((data, ctx) => {
		const hasPhoto = Boolean(data.photoBase64?.trim());
		const hasUrl = Boolean(data.url?.trim());
		if (!hasPhoto && !hasUrl) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Provide a recipe URL or a photo",
				path: ["url"],
			});
		}
		if (hasPhoto && !data.photoMimeType) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "photoMimeType is required with photoBase64",
				path: ["photoMimeType"],
			});
		}
		if (hasPhoto && data.photoBase64) {
			const approxBytes = Math.ceil((data.photoBase64.length * 3) / 4);
			if (approxBytes > RECIPE_IMPORT_PHOTO_MAX_BYTES) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Photo is too large (Max 5MB)",
					path: ["photoBase64"],
				});
			}
		}
		if (data.pageHtml && hasPhoto) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Cannot combine pageHtml with photo import",
				path: ["pageHtml"],
			});
		}
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
				unit: z
					.string()
					.min(1)
					.transform((v) => normalizeUnitAlias(v)),
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

/** Request body schema for import confirm API (persist extracted recipe to Galley). */
export const ImportConfirmRequestSchema = z.object({
	requestId: z.string().uuid("Request ID must be a valid UUID"),
});

export type ImportConfirmRequest = z.infer<typeof ImportConfirmRequestSchema>;
