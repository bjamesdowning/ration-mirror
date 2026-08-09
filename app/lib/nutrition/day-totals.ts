/**
 * Pure aggregates for Manifest day nutrition headers (planned vs logged).
 */

import {
	type DayNutrientTotals,
	emptyDayNutrientTotals,
	formatConsumedVsGoal,
} from "./goal-progress";

export type {
	DayNutrientTotals,
	GoalProgressLine,
	UserGoalTargets,
} from "./goal-progress";
export {
	emptyDayNutrientTotals,
	formatConsumedVsGoal,
	formatGoalProgressStrip,
	goalTargetsFromRow,
	hasAnyGoalTarget,
	selectGoalProgressLines,
} from "./goal-progress";

export type DayNutritionEntryInput = {
	date: string;
	/** Recipe/plan servings for this entry (override ?? meal servings). */
	effectiveServings: number;
	/** meal.nutrition.perServing.energyKcal when known. */
	energyKcalPerServing: number | null;
};

export type DayConsumedIntakeInput = {
	date: string;
	energyKcal: number;
	proteinG?: number;
	carbsG?: number;
	fatG?: number;
	fiberG?: number;
};

export type ManifestDayNutritionTotals = {
	date: string;
	/** Sum of perServing × effectiveServings for all planned entries that day. */
	plannedKcal: number;
	/** Sum of nutrition_intake nutrients for that day. */
	consumed: DayNutrientTotals;
	/** @deprecated Prefer consumed.energyKcal — kept for callers mid-migration. */
	consumedKcal: number;
};

/**
 * Aggregate planned (from meal snapshots on plan entries) and consumed
 * (from intake rows) nutrients per visible date.
 */
export function aggregateManifestDayNutrition(
	entries: DayNutritionEntryInput[],
	intakes: DayConsumedIntakeInput[],
	dates: string[],
): Record<string, ManifestDayNutritionTotals> {
	const result: Record<string, ManifestDayNutritionTotals> = {};
	for (const date of dates) {
		const consumed = emptyDayNutrientTotals();
		result[date] = {
			date,
			plannedKcal: 0,
			consumed,
			consumedKcal: 0,
		};
	}

	for (const entry of entries) {
		const bucket = result[entry.date];
		if (!bucket) continue;
		const per = entry.energyKcalPerServing;
		if (per == null || !Number.isFinite(per)) continue;
		const servings = entry.effectiveServings;
		if (!Number.isFinite(servings) || servings <= 0) continue;
		bucket.plannedKcal += per * servings;
	}

	for (const intake of intakes) {
		const bucket = result[intake.date];
		if (!bucket) continue;
		if (Number.isFinite(intake.energyKcal)) {
			bucket.consumed.energyKcal += intake.energyKcal;
		}
		if (intake.proteinG != null && Number.isFinite(intake.proteinG)) {
			bucket.consumed.proteinG += intake.proteinG;
		}
		if (intake.carbsG != null && Number.isFinite(intake.carbsG)) {
			bucket.consumed.carbsG += intake.carbsG;
		}
		if (intake.fatG != null && Number.isFinite(intake.fatG)) {
			bucket.consumed.fatG += intake.fatG;
		}
		if (intake.fiberG != null && Number.isFinite(intake.fiberG)) {
			bucket.consumed.fiberG += intake.fiberG;
		}
		bucket.consumedKcal = bucket.consumed.energyKcal;
	}

	return result;
}

/** @deprecated Use formatConsumedVsGoal — kept for existing call sites. */
export function formatConsumedVsGoalKcal(
	consumedKcal: number,
	goalKcal: number,
): string {
	return formatConsumedVsGoal(consumedKcal, goalKcal);
}
