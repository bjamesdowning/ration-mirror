import { z } from "zod";

export const NutritionSourceSchema = z.enum([
	"usda",
	"ai_estimate",
	"user_override",
]);

export const NutrientValuesSchema = z.object({
	energyKcal: z.number(),
	proteinG: z.number(),
	fatG: z.number(),
	carbG: z.number(),
	fiberG: z.number().nullable(),
	sugarG: z.number().nullable(),
	satFatG: z.number().nullable(),
	sodiumMg: z.number().nullable(),
	saltG: z.number().nullable(),
});

export const NutritionSnapshotSchema = z.object({
	source: NutritionSourceSchema,
	confidence: z.number().min(0).max(1),
	verified: z.boolean(),
	per100g: NutrientValuesSchema.nullable(),
	perServing: NutrientValuesSchema.nullable(),
	fdcId: z.number().int().nullable(),
	description: z.string().nullable(),
});

export type NutritionSnapshotInput = z.infer<typeof NutritionSnapshotSchema>;

/** Optional cargo nutrition override on create/update (user_override path). */
export const CargoNutritionOverrideSchema = NutritionSnapshotSchema.extend({
	source: z.literal("user_override").default("user_override"),
	verified: z.boolean().default(true),
}).partial({
	per100g: true,
	perServing: true,
	fdcId: true,
	description: true,
	confidence: true,
	verified: true,
});

export const ConsumePortionsSchema = z.object({
	servings: z.coerce.number().positive().max(100),
	mealId: z.string().min(1).optional(),
	entryId: z.string().min(1).optional(),
	planId: z.string().min(1).optional(),
	manifestDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "manifestDate must be YYYY-MM-DD"),
	slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
});

export type ConsumePortionsInput = z.infer<typeof ConsumePortionsSchema>;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const NutritionGoalSchema = z.object({
	dailyEnergyKcal: z.coerce.number().positive().max(20_000),
	proteinG: z.coerce.number().nonnegative().max(2_000),
	carbsG: z.coerce.number().nonnegative().max(2_000),
	fatG: z.coerce.number().nonnegative().max(2_000),
	fiberG: z.coerce.number().nonnegative().max(500).nullable().optional(),
	effectiveFrom: z
		.string()
		.regex(ISO_DATE_REGEX, "effectiveFrom must be YYYY-MM-DD"),
	consentAt: z.coerce.date().optional(),
});

export type NutritionGoalInput = z.infer<typeof NutritionGoalSchema>;

/** POST/PATCH body — consent timestamp required for Art. 9 health data. */
export const NutritionGoalUpsertSchema = NutritionGoalSchema.extend({
	consentAt: z.coerce.date(),
});

export type NutritionGoalUpsertInput = z.infer<
	typeof NutritionGoalUpsertSchema
>;

export const NutritionSummaryQuerySchema = z
	.object({
		from: z.string().regex(ISO_DATE_REGEX, "from must be YYYY-MM-DD"),
		to: z.string().regex(ISO_DATE_REGEX, "to must be YYYY-MM-DD"),
	})
	.refine((v) => v.from <= v.to, {
		message: "from must be on or before to",
		path: ["from"],
	});

export type NutritionSummaryQuery = z.infer<typeof NutritionSummaryQuerySchema>;

export const NutritionDayTotalsSchema = z.object({
	date: z.string(),
	energyKcal: z.number(),
	proteinG: z.number(),
	carbsG: z.number(),
	fatG: z.number(),
	coverageAvg: z.number(),
	entryCount: z.number().int(),
});

export const NutritionSummarySchema = z.object({
	from: z.string(),
	to: z.string(),
	totals: z.object({
		energyKcal: z.number(),
		proteinG: z.number(),
		carbsG: z.number(),
		fatG: z.number(),
	}),
	days: z.array(NutritionDayTotalsSchema),
	goal: z
		.object({
			dailyEnergyKcal: z.number(),
			proteinG: z.number(),
			carbsG: z.number(),
			fatG: z.number(),
			fiberG: z.number().nullable(),
			effectiveFrom: z.string(),
			effectiveTo: z.string().nullable(),
		})
		.nullable(),
});

export type NutritionSummary = z.infer<typeof NutritionSummarySchema>;

/** Batch resolve food names → nutrition snapshots (scan review). */
export const NutritionResolveRequestSchema = z.object({
	names: z.array(z.string().min(1).max(200)).min(1).max(50),
	/**
	 * When true and nutrition-ai-estimate is on, AI-fill USDA misses.
	 * Only set from AI ingest UIs (receipt scan review).
	 */
	allowAiEstimate: z.boolean().optional(),
});

export type NutritionResolveRequest = z.infer<
	typeof NutritionResolveRequestSchema
>;
