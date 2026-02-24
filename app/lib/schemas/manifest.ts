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
	servingsOverride: z.coerce.number().int().min(1).optional(),
	notes: z.string().max(500).optional(),
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
