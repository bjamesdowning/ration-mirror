import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Strict proleptic-Gregorian calendar label (YYYY-MM-DD). Rejects impossible dates. */
export const CalendarDateSchema = z
	.string()
	.regex(ISO_DATE_REGEX, "Must be YYYY-MM-DD")
	.refine((value) => {
		const [y, m, d] = value.split("-").map((part) => Number(part));
		if (
			!Number.isInteger(y) ||
			!Number.isInteger(m) ||
			!Number.isInteger(d) ||
			m < 1 ||
			m > 12 ||
			d < 1 ||
			d > 31
		) {
			return false;
		}
		const dt = new Date(Date.UTC(y, m - 1, d));
		return (
			dt.getUTCFullYear() === y &&
			dt.getUTCMonth() === m - 1 &&
			dt.getUTCDate() === d
		);
	}, "Must be a real Gregorian calendar date");

export type CalendarDate = z.infer<typeof CalendarDateSchema>;

const NutrientAmountSchema = z.number().nonnegative().max(100_000);
const NullableNutrientAmountSchema = NutrientAmountSchema.nullable();

/** Canonical API nutrient amounts — unknown is null, never coerced to zero. */
export const NutrientAmountsV2Schema = z.object({
	energyKcal: NullableNutrientAmountSchema,
	proteinG: NullableNutrientAmountSchema,
	carbsG: NullableNutrientAmountSchema,
	fatG: NullableNutrientAmountSchema,
	fiberG: NullableNutrientAmountSchema,
	sugarG: NullableNutrientAmountSchema,
	satFatG: NullableNutrientAmountSchema,
	sodiumMg: NullableNutrientAmountSchema,
	saltG: NullableNutrientAmountSchema,
});

export type NutrientAmountsV2 = z.infer<typeof NutrientAmountsV2Schema>;

export const NutritionSourceV2Schema = z.enum([
	"usda",
	"ai_estimate",
	"user_override",
]);

export const NutritionMatchQualityV2Schema = z.enum([
	"verified",
	"high",
	"medium",
	"low",
	"unknown",
]);

export const NutritionServingBasisV2Schema = z.enum([
	"per100g",
	"perServing",
	"package",
]);

export const FoodNutritionSnapshotV2Schema = z.object({
	schemaVersion: z.literal(2),
	kind: z.literal("food"),
	source: NutritionSourceV2Schema,
	confidence: z.number().min(0).max(1),
	verified: z.boolean(),
	sourceRef: z.string().max(200).nullable(),
	matchQuality: NutritionMatchQualityV2Schema,
	servingBasis: NutritionServingBasisV2Schema.nullable(),
	nutrientCoverage: z.number().min(0).max(1),
	per100g: NutrientAmountsV2Schema.nullable(),
	perServing: NutrientAmountsV2Schema.nullable(),
	fdcId: z.number().int().nullable(),
	description: z.string().nullable(),
});

export type FoodNutritionSnapshotV2 = z.infer<
	typeof FoodNutritionSnapshotV2Schema
>;

export const MealNutritionSnapshotV2Schema = z.object({
	schemaVersion: z.literal(2),
	kind: z.literal("meal"),
	perServing: NutrientAmountsV2Schema,
	coverage: z.number().min(0).max(1),
	computedAt: z.string().min(1),
	attributions: z.array(
		z.object({
			ingredientIndex: z.number().int().nonnegative(),
			ingredientName: z.string(),
			fdcId: z.number().int().nullable(),
			source: NutritionSourceV2Schema,
			grams: z.number().nullable(),
			contribution: NutrientAmountsV2Schema,
		}),
	),
});

export type MealNutritionSnapshotV2 = z.infer<
	typeof MealNutritionSnapshotV2Schema
>;

export const NutritionGoalDTOSchema = z.object({
	schemaVersion: z.literal(2),
	id: z.string().uuid().optional(),
	dailyEnergyKcal: z.number().nullable(),
	proteinG: z.number().nullable(),
	carbsG: z.number().nullable(),
	fatG: z.number().nullable(),
	fiberG: z.number().nullable(),
	effectiveFrom: CalendarDateSchema,
	effectiveTo: CalendarDateSchema.nullable(),
	consentAt: z.string().min(1).optional(),
	createdAt: z.string().min(1).optional(),
});

export type NutritionGoalDTO = z.infer<typeof NutritionGoalDTOSchema>;

export const NutritionIntakeDTOSchema = z.object({
	schemaVersion: z.literal(2),
	id: z.string().uuid(),
	manifestDate: CalendarDateSchema,
	slotType: z.string().nullable(),
	servings: z.number().positive(),
	energyKcal: z.number(),
	proteinG: z.number(),
	carbsG: z.number(),
	fatG: z.number(),
	fiberG: z.number().nullable().optional(),
	mealId: z.string().nullable(),
	mealName: z.string().nullable(),
	verified: z.boolean(),
	occurredAt: z.string().min(1),
	notes: z.string().max(280).nullable().optional(),
});

export type NutritionIntakeDTO = z.infer<typeof NutritionIntakeDTOSchema>;

export const NutritionDayTotalsDTOSchema = z.object({
	schemaVersion: z.literal(2),
	date: CalendarDateSchema,
	energyKcal: z.number(),
	proteinG: z.number(),
	carbsG: z.number(),
	fatG: z.number(),
	fiberG: z.number().nullable().optional(),
	coverageAvg: z.number(),
	entryCount: z.number().int(),
});

export type NutritionDayTotalsDTO = z.infer<typeof NutritionDayTotalsDTOSchema>;

export const NutritionSummaryV2Schema = z.object({
	schemaVersion: z.literal(2),
	from: CalendarDateSchema,
	to: CalendarDateSchema,
	goalAsOf: CalendarDateSchema,
	totals: z.object({
		energyKcal: z.number(),
		proteinG: z.number(),
		carbsG: z.number(),
		fatG: z.number(),
		fiberG: z.number().nullable().optional(),
	}),
	days: z.array(NutritionDayTotalsDTOSchema),
	goal: NutritionGoalDTOSchema.nullable(),
});

export type NutritionSummaryV2 = z.infer<typeof NutritionSummaryV2Schema>;

export const PlannedDatesResponseV2Schema = z.object({
	schemaVersion: z.literal(2),
	from: CalendarDateSchema,
	to: CalendarDateSchema,
	dates: z.array(CalendarDateSchema),
	consumedDates: z.array(CalendarDateSchema).optional(),
});

export type PlannedDatesResponseV2 = z.infer<
	typeof PlannedDatesResponseV2Schema
>;
