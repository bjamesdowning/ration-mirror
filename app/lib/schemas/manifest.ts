import { z } from "zod";

export const SLOT_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export type SlotType = (typeof SLOT_TYPES)[number];

export const SLOT_LABELS: Record<SlotType, string> = {
	breakfast: "Breakfast",
	lunch: "Lunch",
	dinner: "Dinner",
	snack: "Snack",
};

export const SLOT_LABELS_SHORT: Record<SlotType, string> = {
	breakfast: "BRKFST",
	lunch: "LUNCH",
	dinner: "DINNER",
	snack: "SNACK",
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const MealPlanCreateSchema = z.object({
	name: z.string().min(1).max(100).optional(),
});

export const MealPlanEntryCreateSchema = z.object({
	mealId: z.string().uuid(),
	date: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD format"),
	slotType: z.enum(SLOT_TYPES),
	orderIndex: z.coerce.number().int().min(0).default(0),
	servingsOverride: z
		.union([z.coerce.number().int().min(1), z.literal(null)])
		.optional(),
	notes: z.string().max(500).nullable().optional(),
});

export const MealPlanEntryUpdateSchema = z.object({
	date: z.string().regex(ISO_DATE_REGEX).optional(),
	slotType: z.enum(SLOT_TYPES).optional(),
	orderIndex: z.coerce.number().int().min(0).optional(),
	servingsOverride: z.coerce.number().int().min(1).nullable().optional(),
	notes: z.string().max(500).nullable().optional(),
});

export const WeekQuerySchema = z.object({
	startDate: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD format"),
	endDate: z.string().regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD format"),
});

export const EntryIdParamSchema = z.object({
	entryId: z.string().uuid(),
});

export const ConsumeEntryPortionSchema = z.object({
	entryId: z.string().uuid(),
	/** Portion of the meal logged as intake; 0 skips intake for that entry. */
	servings: z.coerce.number().min(0).max(100),
});

export const ConsumeEntriesRequestSchema = z.object({
	entryIds: z.array(z.string().uuid()).min(1).max(50),
	confirmInsufficient: z.boolean().optional(),
	/**
	 * When nutrition-manifest is on, defaults to true. Set false to consume
	 * without writing nutrition_intake ("Skip calorie log").
	 */
	logNutrition: z.boolean().optional(),
	/** Per-entry plate-up portions (defaults to 1.0 when omitted). */
	portions: z.array(ConsumeEntryPortionSchema).max(50).optional(),
});

/**
 * Used by the bulk-add endpoint for both the "Copy Entry / Day" features
 * and the future AI meal planner. The AI planner will POST an identical
 * payload — only the source of `entries[]` differs (client copy vs. LLM).
 */
export const BulkEntryCreateSchema = z.object({
	entries: z.array(MealPlanEntryCreateSchema).min(1).max(50),
});
