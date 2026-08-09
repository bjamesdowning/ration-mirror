/**
 * Pure aggregates for Manifest day nutrition headers (planned vs logged).
 */

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
};

export type ManifestDayNutritionTotals = {
	date: string;
	/** Sum of perServing × effectiveServings for all planned entries that day. */
	plannedKcal: number;
	/** Sum of nutrition_intake.energyKcal for that day. */
	consumedKcal: number;
};

/**
 * Aggregate planned (from meal snapshots on plan entries) and consumed
 * (from intake rows) kcal per visible date.
 */
export function aggregateManifestDayNutrition(
	entries: DayNutritionEntryInput[],
	intakes: DayConsumedIntakeInput[],
	dates: string[],
): Record<string, ManifestDayNutritionTotals> {
	const result: Record<string, ManifestDayNutritionTotals> = {};
	for (const date of dates) {
		result[date] = { date, plannedKcal: 0, consumedKcal: 0 };
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
		if (!Number.isFinite(intake.energyKcal)) continue;
		bucket.consumedKcal += intake.energyKcal;
	}

	return result;
}

/** Format "1,240 / 2,000" style labels (neutral framing). */
export function formatConsumedVsGoalKcal(
	consumedKcal: number,
	goalKcal: number,
): string {
	const fmt = (n: number) =>
		Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
	return `${fmt(consumedKcal)} / ${fmt(goalKcal)}`;
}
