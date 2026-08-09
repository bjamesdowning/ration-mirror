import type { NutritionSummary } from "~/lib/schemas/nutrition";
import {
	normalizeNutritionSnapshot,
	projectNutritionSnapshotToLegacy,
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

/** API-facing nutrition snapshot (v2 fields + legacy projection). */
export function serializeNutritionSnapshot(snapshot: AnyNutritionSnapshot) {
	const v2 = normalizeNutritionSnapshot(snapshot);
	const legacy = projectNutritionSnapshotToLegacy(v2);

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
	} satisfies NutritionSnapshotV2 & { legacy: typeof legacy };
}

export function serializeMealNutrition(snapshot: MealNutritionSnapshot) {
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
	};
}

export function serializeNutritionGoal(
	goal: NonNullable<NutritionSummaryResult["goal"]>,
) {
	return {
		dailyEnergyKcal: goal.dailyEnergyKcal,
		proteinG: goal.proteinG,
		carbsG: goal.carbsG,
		fatG: goal.fatG,
		fiberG: goal.fiberG,
		effectiveFrom: goal.effectiveFrom,
		effectiveTo: goal.effectiveTo,
	};
}

export function serializeNutritionSummary(
	summary: NutritionSummaryResult,
): NutritionSummary {
	return {
		from: summary.from,
		to: summary.to,
		totals: summary.totals,
		days: summary.days,
		goal: summary.goal ? serializeNutritionGoal(summary.goal) : null,
	};
}

export function serializeNutritionIntake(row: NutritionIntakeRow) {
	return {
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
