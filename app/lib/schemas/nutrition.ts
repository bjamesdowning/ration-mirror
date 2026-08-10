import { z } from "zod";
import { CalendarDateSchema } from "./nutrition-contract";

export const NutritionSourceSchema = z.enum([
	"usda",
	"ai_estimate",
	"user_override",
]);

/** Nonnegative nutrient with a sane upper bound (package / per-100g). */
const NutrientAmountSchema = z.number().nonnegative().max(100_000);
const NullableNutrientAmountSchema = NutrientAmountSchema.nullable();

/** Legacy v1 — core macros required; optional micronutrients nullable. */
export const NutrientValuesSchema = z.object({
	energyKcal: NutrientAmountSchema,
	proteinG: NutrientAmountSchema,
	fatG: NutrientAmountSchema,
	carbG: NutrientAmountSchema,
	fiberG: NullableNutrientAmountSchema,
	sugarG: NullableNutrientAmountSchema,
	satFatG: NullableNutrientAmountSchema,
	sodiumMg: NullableNutrientAmountSchema,
	saltG: NullableNutrientAmountSchema,
});

/** v2 — all nutrient amounts nullable (unknown ≠ zero). */
export const NullableNutrientValuesSchema = z.object({
	energyKcal: NullableNutrientAmountSchema,
	proteinG: NullableNutrientAmountSchema,
	fatG: NullableNutrientAmountSchema,
	carbG: NullableNutrientAmountSchema,
	fiberG: NullableNutrientAmountSchema,
	sugarG: NullableNutrientAmountSchema,
	satFatG: NullableNutrientAmountSchema,
	sodiumMg: NullableNutrientAmountSchema,
	saltG: NullableNutrientAmountSchema,
});

export const NutritionMatchQualitySchema = z.enum([
	"verified",
	"high",
	"medium",
	"low",
	"unknown",
]);

export const NutritionServingBasisSchema = z.enum([
	"per100g",
	"perServing",
	"package",
]);

export const NutritionSnapshotSchema = z.object({
	source: NutritionSourceSchema,
	confidence: z.number().min(0).max(1),
	verified: z.boolean(),
	per100g: NutrientValuesSchema.nullable(),
	perServing: NutrientValuesSchema.nullable(),
	fdcId: z.number().int().nullable(),
	description: z.string().nullable(),
});

/** v2 additive contract — extends legacy fields with nullable nutrient blocks. */
export const NutritionSnapshotV2Schema = NutritionSnapshotSchema.extend({
	schemaVersion: z.literal(2),
	sourceRef: z.string().max(200).nullable(),
	matchQuality: NutritionMatchQualitySchema,
	servingBasis: NutritionServingBasisSchema.nullable(),
	nutrientCoverage: z.number().min(0).max(1),
	per100g: NullableNutrientValuesSchema.nullable(),
	perServing: NullableNutrientValuesSchema.nullable(),
});

/** Accept legacy v1 or explicit v2 payloads. */
export const AnyNutritionSnapshotSchema = z.union([
	NutritionSnapshotV2Schema,
	NutritionSnapshotSchema,
]);

export type NutritionSnapshotInput = z.infer<typeof NutritionSnapshotSchema>;

/** Optional cargo nutrition override on create/update (user_override path). */
export const CargoNutritionOverrideSchema = NutritionSnapshotSchema.extend({
	source: z.literal("user_override").default("user_override"),
	/** Only true when the client explicitly marks an override save. */
	verified: z.boolean().default(false),
}).partial({
	per100g: true,
	perServing: true,
	fdcId: true,
	description: true,
	confidence: true,
	verified: true,
});

/**
 * Server-trusted AI-ingest context. Client booleans alone must not enable AI.
 * Only `scan_review` (cargo photo / supply dock receipt review) may request AI estimate.
 */
export const NutritionIngestSourceSchema = z.enum(["scan_review"]);

export const ConsumePortionsSchema = z.object({
	servings: z.coerce.number().positive().max(100),
	mealId: z.string().min(1).optional(),
	entryId: z.string().min(1).optional(),
	planId: z.string().min(1).optional(),
	manifestDate: CalendarDateSchema,
	slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
});

export type ConsumePortionsInput = z.infer<typeof ConsumePortionsSchema>;

/** Empty / omitted → undefined; keep 0 as an explicit target; null stays null. */
function nullableNutrient(
	schema: z.ZodTypeAny,
): z.ZodType<number | null | undefined> {
	return z.preprocess((value) => {
		if (value === "" || value === undefined) return undefined;
		if (value === null) return null;
		return value;
		// Prefer `z.null()` before coerce schemas — `z.coerce.number()` maps null → 0.
	}, z.union([z.null(), schema]).optional()) as z.ZodType<
		number | null | undefined
	>;
}

const goalEnergyField = nullableNutrient(
	z.coerce.number().nonnegative().max(20_000),
);
const goalMacroField = nullableNutrient(
	z.coerce.number().nonnegative().max(2_000),
);
const goalFiberField = nullableNutrient(
	z.coerce.number().nonnegative().max(500),
);

function countSetGoalNutrients(data: {
	dailyEnergyKcal?: number | null;
	proteinG?: number | null;
	carbsG?: number | null;
	fatG?: number | null;
	fiberG?: number | null;
}): number {
	return [
		data.dailyEnergyKcal,
		data.proteinG,
		data.carbsG,
		data.fatG,
		data.fiberG,
	].filter((v) => v != null && Number.isFinite(v)).length;
}

const NutritionGoalFieldsObject = z.object({
	dailyEnergyKcal: goalEnergyField,
	proteinG: goalMacroField,
	carbsG: goalMacroField,
	fatG: goalMacroField,
	fiberG: goalFiberField,
	effectiveFrom: CalendarDateSchema,
});

function requireGoalTarget(
	data: z.infer<typeof NutritionGoalFieldsObject>,
	ctx: z.RefinementCtx,
) {
	if (countSetGoalNutrients(data) < 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Set at least one nutrient target",
			path: ["dailyEnergyKcal"],
		});
	}
}

const NutritionGoalFieldsSchema =
	NutritionGoalFieldsObject.strict().superRefine(requireGoalTarget);

function normalizeGoalFields(data: z.infer<typeof NutritionGoalFieldsSchema>) {
	return {
		dailyEnergyKcal: data.dailyEnergyKcal ?? null,
		proteinG: data.proteinG ?? null,
		carbsG: data.carbsG ?? null,
		fatG: data.fatG ?? null,
		fiberG: data.fiberG ?? null,
		effectiveFrom: data.effectiveFrom,
	};
}

export const NutritionGoalSchema =
	NutritionGoalFieldsSchema.transform(normalizeGoalFields);

export type NutritionGoalInput = z.infer<typeof NutritionGoalSchema>;

/** POST/PATCH body. Consent is established only through the privacy route. */
export const NutritionGoalUpsertSchema = NutritionGoalFieldsObject.extend({
	operationKey: z.string().uuid(),
})
	.strict()
	.superRefine(requireGoalTarget)
	.transform((data) => ({
		...normalizeGoalFields(data),
		operationKey: data.operationKey,
	}));

export type NutritionGoalUpsertInput = z.infer<
	typeof NutritionGoalUpsertSchema
>;

/** Optional client calendar day for “active goal as of” (YYYY-MM-DD). */
export const NutritionGoalAsOfQuerySchema = z.object({
	asOf: CalendarDateSchema.optional(),
});

export type NutritionGoalAsOfQuery = z.infer<
	typeof NutritionGoalAsOfQuerySchema
>;

/** Max inclusive span for nutrition summary queries (calendar days). */
export const NUTRITION_SUMMARY_MAX_SPAN_DAYS = 93;

function utcCalendarDayDiffInclusive(from: string, to: string): number {
	const fromMs = Date.parse(`${from}T00:00:00.000Z`);
	const toMs = Date.parse(`${to}T00:00:00.000Z`);
	if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return Number.NaN;
	return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

export const NutritionSummaryQuerySchema = z
	.object({
		from: CalendarDateSchema,
		to: CalendarDateSchema,
	})
	.refine((v) => v.from <= v.to, {
		message: "from must be on or before to",
		path: ["from"],
	})
	.refine(
		(v) =>
			utcCalendarDayDiffInclusive(v.from, v.to) <=
			NUTRITION_SUMMARY_MAX_SPAN_DAYS,
		{
			message: `Date range must be at most ${NUTRITION_SUMMARY_MAX_SPAN_DAYS} days`,
			path: ["to"],
		},
	);

export type NutritionSummaryQuery = z.infer<typeof NutritionSummaryQuerySchema>;

export const NutritionDayTotalsSchema = z.object({
	date: z.string(),
	energyKcal: z.number(),
	proteinG: z.number(),
	carbsG: z.number(),
	fatG: z.number(),
	/** Known fiber from nutrientsJson rollup; omitted when unknown. */
	fiberG: z.number().optional(),
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
		fiberG: z.number().optional(),
	}),
	days: z.array(NutritionDayTotalsSchema),
	goal: z
		.object({
			dailyEnergyKcal: z.number().nullable(),
			proteinG: z.number().nullable(),
			carbsG: z.number().nullable(),
			fatG: z.number().nullable(),
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
	 * @deprecated Ignored server-side. Use `ingestSource: "scan_review"`.
	 */
	allowAiEstimate: z.boolean().optional(),
	/**
	 * Server-gated AI ingest path. AI estimate only when this is `scan_review`
	 * and `nutrition-ai-estimate` is on.
	 */
	ingestSource: NutritionIngestSourceSchema.optional(),
});

export type NutritionResolveRequest = z.infer<
	typeof NutritionResolveRequestSchema
>;

/**
 * Queue wake payload — no user/org IDs, names, or nutrient values.
 * D1 `nutrition_recompute_job` is the source of truth.
 */
export const NutritionRecomputeWakeSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("nutrition.recompute.wake"),
		jobKey: z.string().min(1).max(200),
		sentAt: z.string().datetime(),
	})
	.strict();

export type NutritionRecomputeWakeMessage = z.infer<
	typeof NutritionRecomputeWakeSchema
>;

/**
 * @deprecated Legacy stub shape — prefer {@link NutritionRecomputeWakeSchema}.
 * Kept so old in-flight test fixtures still parse during rollout.
 */
export const NutritionRecomputeJobSchema = z.object({
	jobId: z.string().uuid(),
	organizationId: z.string().min(1),
	mealId: z.string().min(1).optional(),
	cargoId: z.string().min(1).optional(),
	trigger: z.enum(["cargo", "meal", "batch"]),
	enqueuedAt: z.string().datetime(),
});

export type NutritionRecomputeJobMessage = z.infer<
	typeof NutritionRecomputeJobSchema
>;
