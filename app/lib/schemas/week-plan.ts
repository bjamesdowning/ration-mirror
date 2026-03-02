import { z } from "zod";
import { SLOT_TYPES } from "./manifest";
import { INJECTION_PATTERNS } from "./meal";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const VARIETY_LEVELS = ["low", "medium", "high"] as const;
export type VarietyLevel = (typeof VARIETY_LEVELS)[number];

export const VARIETY_LABELS: Record<VarietyLevel, string> = {
	low: "Repeat-Friendly",
	medium: "Balanced",
	high: "Maximum Variety",
};

export const VARIETY_DESCRIPTIONS: Record<VarietyLevel, string> = {
	low: "May repeat meals across days",
	medium: "Moderate variety, some repeats OK",
	high: "Unique meals for every slot",
};

const sanitizeText = (v: string) =>
	v
		.split("")
		.filter((c) => {
			const code = c.charCodeAt(0);
			return (code >= 32 && code !== 127) || code === 9;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();

/**
 * Request body schema for POST /api/meal-plans/:id/plan-week.
 * Validated and sanitized before reaching the AI layer.
 */
export const WeekPlanRequestSchema = z
	.object({
		/** Number of days to fill, starting from startDate. 1–7. */
		days: z.coerce.number().int().min(1).max(7).default(7),
		/** ISO date for the first day of the plan (YYYY-MM-DD). */
		startDate: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD format"),
		/** Meal slots to include. At least one required. */
		slots: z
			.array(z.enum(SLOT_TYPES))
			.min(1, "At least one meal slot is required")
			.max(4),
		/** Optional tag to filter available meals by (e.g. "vegetarian"). */
		tag: z
			.string()
			.max(50)
			.optional()
			.transform((v) =>
				v ? sanitizeText(v).toLowerCase() || undefined : undefined,
			),
		/** Optional dietary/preference note injected into the AI prompt. */
		dietaryNote: z
			.string()
			.max(200, "Dietary note must be 200 characters or less")
			.optional()
			.transform((v) => {
				if (!v) return undefined;
				const cleaned = sanitizeText(v);
				return cleaned.length > 0 ? cleaned : undefined;
			}),
		/** How aggressively the AI avoids repeating meals. */
		variety: z.enum(VARIETY_LEVELS).default("medium"),
	})
	.refine(
		(data) => {
			const note = data.dietaryNote;
			return !note || !INJECTION_PATTERNS.test(note);
		},
		{ message: "Invalid dietary note", path: ["dietaryNote"] },
	)
	.refine(
		(data) => {
			const tag = data.tag;
			return !tag || !INJECTION_PATTERNS.test(tag);
		},
		{ message: "Invalid tag value", path: ["tag"] },
	);

export type WeekPlanRequest = z.infer<typeof WeekPlanRequestSchema>;

/**
 * Single AI-generated schedule entry.
 * mealId must be from the whitelist passed to the AI — validated post-generation.
 */
export const WeekPlanAIEntrySchema = z.object({
	date: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD format"),
	slotType: z.enum(SLOT_TYPES),
	mealId: z.string().uuid(),
	notes: z.string().max(500).nullable().optional(),
});

export type WeekPlanAIEntry = z.infer<typeof WeekPlanAIEntrySchema>;

/**
 * Full AI response schema — wraps the schedule array.
 * Max 50 entries aligns with BulkEntryCreateSchema ceiling.
 */
export const WeekPlanAIResponseSchema = z.object({
	schedule: z
		.array(WeekPlanAIEntrySchema)
		.min(1, "Schedule must contain at least one entry")
		.max(50, "Schedule cannot exceed 50 entries"),
});

export type WeekPlanAIResponse = z.infer<typeof WeekPlanAIResponseSchema>;
