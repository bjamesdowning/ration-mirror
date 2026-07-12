import { z } from "zod";
import {
	isValidTagSlug,
	MAX_TAG_CATEGORY_LENGTH,
	MAX_TAG_SLUG_LENGTH,
	MAX_TAGS_PER_ENTITY,
	normalizeTagSlug,
	sanitizeTagColor,
	TAG_COLOR_PATTERN,
} from "~/lib/tags";

export const TagRecordSchema = z.object({
	id: z.string().uuid(),
	slug: z.string(),
	name: z.string(),
	color: z.string().nullable().optional(),
	category: z.string().nullable().optional(),
});

export const TagSlugSchema = z
	.string()
	.transform((v) => normalizeTagSlug(v))
	.refine((v) => isValidTagSlug(v), {
		message: `Tag slug must match [a-z0-9-] and be 1-${MAX_TAG_SLUG_LENGTH} chars`,
	});

export const TagSlugsInputSchema = z
	.array(TagSlugSchema)
	.max(MAX_TAGS_PER_ENTITY)
	.default([]);

const TagColorSchema = z
	.string()
	.nullable()
	.optional()
	.transform((v) => (v == null ? v : sanitizeTagColor(v)))
	.refine((v) => v === undefined || v === null || TAG_COLOR_PATTERN.test(v), {
		message: "Color must be a 6-digit hex value (#RRGGBB)",
	});

const TagCategorySchema = z
	.string()
	.max(MAX_TAG_CATEGORY_LENGTH)
	.nullable()
	.optional()
	.transform((v) => {
		if (v == null) return v;
		const trimmed = v.trim();
		return trimmed.length > 0 ? trimmed : null;
	});

export const CreateTagSchema = z
	.object({
		name: z.string().trim().min(1).max(100).optional(),
		slug: TagSlugSchema.optional(),
		color: TagColorSchema,
		category: TagCategorySchema,
	})
	.refine((data) => Boolean(data.name || data.slug), {
		message: "Name is required",
		path: ["name"],
	});

export const UpdateTagSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	color: TagColorSchema,
	category: TagCategorySchema,
	slug: TagSlugSchema.optional(),
});

export const MergeTagSchema = z.object({
	targetId: z.string().uuid(),
});

export type TagRecordDTO = z.infer<typeof TagRecordSchema>;
