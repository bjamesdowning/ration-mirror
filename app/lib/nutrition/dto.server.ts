import type { NutritionSummary } from "~/lib/schemas/nutrition";
import type {
	FoodNutritionSnapshotV2,
	MealNutritionSnapshotV2,
	NutritionDayTotalsDTO,
	NutritionGoalDTO,
	NutritionIntakeDTO,
	NutritionSummaryV2,
	PlannedDatesResponseV2,
} from "~/lib/schemas/nutrition-contract";
import {
	normalizeNutritionSnapshot,
	projectNutritionSnapshotToLegacy,
	toCanonicalNutrientAmounts,
} from "./adapters";
import type {
	NutritionIntakeRow,
	NutritionSummaryResult,
} from "./persist.server";
import type {
	AnyNutritionSnapshot,
	MealNutritionSnapshot,
	NutrientAttribution,
	NutritionSnapshotV2,
} from "./types";

export type NutritionSnapshotDto = ReturnType<
	typeof serializeNutritionSnapshot
>;
export type MealNutritionDto = ReturnType<typeof serializeMealNutrition>;
export type NutritionGoalDto = ReturnType<typeof serializeNutritionGoal>;
export type NutritionSummaryDto = ReturnType<typeof serializeNutritionSummary>;
export type NutritionIntakeDto = ReturnType<typeof serializeNutritionIntake>;

function toIso(value: Date | string | null | undefined): string | undefined {
	if (value == null) return undefined;
	if (value instanceof Date) return value.toISOString();
	return value;
}

/** API-facing nutrition snapshot (v2 fields + legacy projection + additive nutritionV2). */
export function serializeNutritionSnapshot(snapshot: AnyNutritionSnapshot) {
	const v2 = normalizeNutritionSnapshot(snapshot);
	const legacy = projectNutritionSnapshotToLegacy(v2);
	const nutritionV2: FoodNutritionSnapshotV2 = {
		schemaVersion: 2,
		kind: "food",
		source: v2.source,
		confidence: v2.confidence,
		verified: v2.verified,
		sourceRef: v2.sourceRef,
		matchQuality: v2.matchQuality,
		servingBasis: v2.servingBasis,
		nutrientCoverage: v2.nutrientCoverage,
		per100g: toCanonicalNutrientAmounts(v2.per100g),
		perServing: toCanonicalNutrientAmounts(v2.perServing),
		fdcId: v2.fdcId,
		description: v2.description,
	};

	return {
		schemaVersion: v2.schemaVersion,
		source: v2.source,
		confidence: v2.confidence,
		verified: v2.verified,
		sourceRef: v2.sourceRef,
		matchQuality: v2.matchQuality,
		servingBasis: v2.servingBasis,
		nutrientCoverage: v2.nutrientCoverage,
		per100g: v2.per100g,
		perServing: v2.perServing,
		fdcId: v2.fdcId,
		description: v2.description,
		legacy,
		nutritionV2,
	} satisfies NutritionSnapshotV2 & {
		legacy: typeof legacy;
		nutritionV2: FoodNutritionSnapshotV2;
	};
}

export function serializeMealNutrition(snapshot: MealNutritionSnapshot) {
	const nutritionV2: MealNutritionSnapshotV2 = {
		schemaVersion: 2,
		kind: "meal",
		perServing: toCanonicalNutrientAmounts(snapshot.perServing) ?? {
			energyKcal: null,
			proteinG: null,
			carbsG: null,
			fatG: null,
			fiberG: null,
			sugarG: null,
			satFatG: null,
			sodiumMg: null,
			saltG: null,
		},
		coverage: snapshot.coverage,
		computedAt: snapshot.computedAt,
		attributions: snapshot.attributions.map((a: NutrientAttribution) => ({
			ingredientIndex: a.ingredientIndex,
			ingredientName: a.ingredientName,
			fdcId: a.fdcId,
			source: a.source,
			grams: a.grams,
			contribution:
				toCanonicalNutrientAmounts(a.contribution) ??
				({
					energyKcal: null,
					proteinG: null,
					carbsG: null,
					fatG: null,
					fiberG: null,
					sugarG: null,
					satFatG: null,
					sodiumMg: null,
					saltG: null,
				} as const),
		})),
	};

	return {
		perServing: snapshot.perServing,
		coverage: snapshot.coverage,
		attributions: snapshot.attributions.map((a: NutrientAttribution) => ({
			ingredientIndex: a.ingredientIndex,
			ingredientName: a.ingredientName,
			fdcId: a.fdcId,
			source: a.source,
			grams: a.grams,
			contribution: a.contribution,
		})),
		computedAt: snapshot.computedAt,
		nutritionV2,
	};
}

export function serializeNutritionGoal(
	goal: NonNullable<NutritionSummaryResult["goal"]> & {
		id?: string;
		consentAt?: Date | string | null;
		createdAt?: Date | string | null;
	},
): NutritionGoalDTO & {
	id?: string;
	consentAt?: string;
	createdAt?: string;
} {
	const dto: NutritionGoalDTO = {
		schemaVersion: 2,
		dailyEnergyKcal: goal.dailyEnergyKcal,
		proteinG: goal.proteinG,
		carbsG: goal.carbsG,
		fatG: goal.fatG,
		fiberG: goal.fiberG,
		effectiveFrom: goal.effectiveFrom,
		effectiveTo: goal.effectiveTo,
	};
	if (goal.id) dto.id = goal.id;
	const consentAt = toIso(goal.consentAt ?? undefined);
	const createdAt = toIso(goal.createdAt ?? undefined);
	if (consentAt) dto.consentAt = consentAt;
	if (createdAt) dto.createdAt = createdAt;
	return dto;
}

/** Legacy v1 summary shape plus additive v2 (`goalAsOf`, schemaVersion). */
export function serializeNutritionSummary(
	summary: NutritionSummaryResult,
): NutritionSummary & { goalAsOf: string; nutritionV2: NutritionSummaryV2 } {
	const goal = summary.goal ? serializeNutritionGoal(summary.goal) : null;
	const days: NutritionDayTotalsDTO[] = summary.days.map((day) => ({
		schemaVersion: 2 as const,
		date: day.date,
		energyKcal: day.energyKcal,
		proteinG: day.proteinG,
		carbsG: day.carbsG,
		fatG: day.fatG,
		...(day.fiberG != null ? { fiberG: day.fiberG } : {}),
		coverageAvg: day.coverageAvg,
		entryCount: day.entryCount,
	}));
	const nutritionV2: NutritionSummaryV2 = {
		schemaVersion: 2,
		from: summary.from,
		to: summary.to,
		goalAsOf: summary.to,
		totals: {
			energyKcal: summary.totals.energyKcal,
			proteinG: summary.totals.proteinG,
			carbsG: summary.totals.carbsG,
			fatG: summary.totals.fatG,
			...(summary.totals.fiberG != null
				? { fiberG: summary.totals.fiberG }
				: {}),
		},
		days,
		goal,
	};
	return {
		from: summary.from,
		to: summary.to,
		goalAsOf: summary.to,
		totals: summary.totals,
		days: summary.days,
		goal: summary.goal
			? {
					dailyEnergyKcal: summary.goal.dailyEnergyKcal,
					proteinG: summary.goal.proteinG,
					carbsG: summary.goal.carbsG,
					fatG: summary.goal.fatG,
					fiberG: summary.goal.fiberG,
					effectiveFrom: summary.goal.effectiveFrom,
					effectiveTo: summary.goal.effectiveTo,
				}
			: null,
		nutritionV2,
	};
}

export function serializeNutritionIntake(
	row: NutritionIntakeRow,
): NutritionIntakeDTO {
	return {
		schemaVersion: 2,
		id: row.id,
		manifestDate: row.manifestDate,
		slotType: row.slotType,
		servings: row.servings,
		energyKcal: row.energyKcal,
		proteinG: row.proteinG,
		carbsG: row.carbsG,
		fatG: row.fatG,
		mealId: row.mealId,
		mealName: row.mealName,
		verified: row.verified === 1,
		occurredAt: row.occurredAt.toISOString(),
	};
}

export function serializeNutritionIntakeList(
	items: NutritionIntakeRow[],
	nextCursor: string | null,
) {
	return {
		items: items.map(serializeNutritionIntake),
		nextCursor,
	};
}

export function serializePlannedDatesResponse(input: {
	from: string;
	to: string;
	dates: string[];
	consumedDates?: string[];
}): PlannedDatesResponseV2 & { dates: string[]; consumedDates?: string[] } {
	return {
		schemaVersion: 2,
		from: input.from,
		to: input.to,
		dates: input.dates,
		...(input.consumedDates ? { consumedDates: input.consumedDates } : {}),
	};
}
