/**
 * Pure helpers for Nutrition Hub widgets (Daily Fuel / Fuel Trends).
 * No I/O — safe for Vitest and shared by web + loaders.
 */

export const NUTRITION_HUB_WIDGET_IDS = [
	"nutrition-today",
	"nutrition-trends",
] as const;

export type NutritionHubWidgetId = (typeof NUTRITION_HUB_WIDGET_IDS)[number];

export const NUTRITION_HUB_NUTRIENTS = [
	"energy",
	"protein",
	"carbs",
	"fat",
	"fiber",
] as const;

export type NutritionHubNutrient = (typeof NUTRITION_HUB_NUTRIENTS)[number];

export const NUTRITION_HUB_RANGES = [7, 14, 30] as const;
export type NutritionHubRange = (typeof NUTRITION_HUB_RANGES)[number];

export const DEFAULT_NUTRITION_HUB_NUTRIENTS: NutritionHubNutrient[] = [
	"energy",
	"protein",
	"carbs",
	"fat",
];

export type NutritionHubDisplayMode = "consumed" | "remaining";

export type NutritionHubClientFlags = {
	nutritionManifest?: boolean;
	nutritionGoals?: boolean;
};

export function isNutritionHubWidgetsEnabled(
	flags: NutritionHubClientFlags | null | undefined,
): boolean {
	return flags?.nutritionManifest === true || flags?.nutritionGoals === true;
}

export function isNutritionHubWidgetId(id: string): id is NutritionHubWidgetId {
	return (NUTRITION_HUB_WIDGET_IDS as readonly string[]).includes(id);
}

/** Drop nutrition widgets when flags are off (layout + edit catalog). */
export function filterNutritionHubWidgetsByFlags<T extends { id: string }>(
	widgets: T[],
	enabled: boolean,
): T[] {
	if (enabled) return widgets;
	return widgets.filter((w) => !isNutritionHubWidgetId(w.id));
}

export function normalizeNutritionHubNutrients(
	raw: string[] | undefined,
): NutritionHubNutrient[] {
	if (!raw?.length) return [...DEFAULT_NUTRITION_HUB_NUTRIENTS];
	const allowed = new Set<string>(NUTRITION_HUB_NUTRIENTS);
	const next = raw.filter((n): n is NutritionHubNutrient => allowed.has(n));
	return next.length ? next.slice(0, 5) : [...DEFAULT_NUTRITION_HUB_NUTRIENTS];
}

export function normalizeNutritionHubRange(
	raw: number | undefined,
): NutritionHubRange {
	if (raw === 7 || raw === 14 || raw === 30) return raw;
	return 7;
}

export function normalizeNutritionDisplayMode(
	raw: string | undefined,
): NutritionHubDisplayMode {
	return raw === "consumed" ? "consumed" : "remaining";
}

export type NutrientAmounts = {
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG?: number | null;
};

export type NutrientGoalTargets = {
	dailyEnergyKcal?: number | null;
	proteinG?: number | null;
	carbsG?: number | null;
	fatG?: number | null;
	fiberG?: number | null;
};

export function nutrientActual(
	amounts: NutrientAmounts,
	nutrient: NutritionHubNutrient,
): number | null {
	switch (nutrient) {
		case "energy":
			return amounts.energyKcal;
		case "protein":
			return amounts.proteinG;
		case "carbs":
			return amounts.carbsG;
		case "fat":
			return amounts.fatG;
		case "fiber":
			return amounts.fiberG ?? null;
	}
}

export function nutrientTarget(
	goal: NutrientGoalTargets | null | undefined,
	nutrient: NutritionHubNutrient,
): number | null {
	if (!goal) return null;
	switch (nutrient) {
		case "energy":
			return goal.dailyEnergyKcal != null && goal.dailyEnergyKcal > 0
				? goal.dailyEnergyKcal
				: null;
		case "protein":
			return goal.proteinG != null && goal.proteinG > 0 ? goal.proteinG : null;
		case "carbs":
			return goal.carbsG != null && goal.carbsG > 0 ? goal.carbsG : null;
		case "fat":
			return goal.fatG != null && goal.fatG > 0 ? goal.fatG : null;
		case "fiber":
			return goal.fiberG != null && goal.fiberG > 0 ? goal.fiberG : null;
	}
}

export function nutrientRatio(
	actual: number | null,
	target: number | null,
): number | null {
	if (actual == null || target == null || !(target > 0)) return null;
	return actual / target;
}

export function clampedRatio(ratio: number | null): number {
	if (ratio == null || !Number.isFinite(ratio)) return 0;
	return Math.min(Math.max(ratio, 0), 1);
}

/**
 * Chart fill for Daily Fuel.
 * - consumed: fills up toward the goal (actual / target)
 * - remaining: depletes from full (remaining / target); empty when over
 */
export function nutritionChartFill(
	mode: NutritionHubDisplayMode,
	ratio: number | null,
): number {
	if (ratio == null || !Number.isFinite(ratio)) return 0;
	const consumed = clampedRatio(ratio);
	if (mode === "remaining") {
		if (ratio > 1) return 0;
		return 1 - consumed;
	}
	return consumed;
}

/** Remaining toward target (floored at 0). Null when no target. */
export function nutrientRemaining(
	actual: number | null,
	target: number | null,
): number | null {
	if (actual == null || target == null || !(target > 0)) return null;
	return Math.max(target - actual, 0);
}

export function nutrientOverage(
	actual: number | null,
	target: number | null,
): number | null {
	if (actual == null || target == null || !(target > 0)) return null;
	const over = actual - target;
	return over > 0 ? over : null;
}

export function nutrientUnit(nutrient: NutritionHubNutrient): string {
	return nutrient === "energy" ? "kcal" : "g";
}

export function nutrientLabel(nutrient: NutritionHubNutrient): string {
	switch (nutrient) {
		case "energy":
			return "Calories";
		case "protein":
			return "Protein";
		case "carbs":
			return "Carbs";
		case "fat":
			return "Fat";
		case "fiber":
			return "Fiber";
	}
}

export function nutrientShortLabel(nutrient: NutritionHubNutrient): string {
	switch (nutrient) {
		case "energy":
			return "kcal";
		case "protein":
			return "P";
		case "carbs":
			return "C";
		case "fat":
			return "F";
		case "fiber":
			return "Fiber";
	}
}

/** Average daily actuals across a filled day series (include zero days). */
export function averageDailyAmounts(
	days: NutrientAmounts[],
): NutrientAmounts | null {
	if (days.length === 0) return null;
	const n = days.length;
	let energy = 0;
	let protein = 0;
	let carbs = 0;
	let fat = 0;
	let fiberSum = 0;
	let fiberKnown = 0;
	for (const day of days) {
		energy += day.energyKcal;
		protein += day.proteinG;
		carbs += day.carbsG;
		fat += day.fatG;
		if (day.fiberG != null) {
			fiberSum += day.fiberG;
			fiberKnown += 1;
		}
	}
	return {
		energyKcal: energy / n,
		proteinG: protein / n,
		carbsG: carbs / n,
		fatG: fat / n,
		...(fiberKnown > 0 ? { fiberG: fiberSum / fiberKnown } : {}),
	};
}

export type DayWithNutrients = NutrientAmounts & {
	date: string;
	entryCount?: number;
};

/** Count days where actual meets or exceeds target for a nutrient. */
export function adherenceDayCount(
	days: DayWithNutrients[],
	goal: NutrientGoalTargets | null | undefined,
	nutrient: NutritionHubNutrient,
): { hit: number; total: number } {
	const target = nutrientTarget(goal, nutrient);
	// Prefer a contiguous series from {@link fillSparseNutritionDays}.
	const total = days.length;
	if (target == null || total === 0) return { hit: 0, total };
	let hit = 0;
	for (const day of days) {
		const actual = nutrientActual(day, nutrient);
		if (actual != null && actual >= target) hit += 1;
	}
	return { hit, total };
}

export type SparseNutritionDay = DayWithNutrients & {
	coverageAvg?: number;
};

/**
 * Backfill every local calendar day in `from...to` (inclusive) with zeros where
 * the server omitted empty days — mirrors iOS `NutritionDayFill.fillSparseDays`.
 */
export function fillSparseNutritionDays(
	from: string,
	to: string,
	days: SparseNutritionDay[],
): SparseNutritionDay[] {
	if (!from || !to || from > to) return days;
	const byDate = new Map(days.map((d) => [d.date, d]));
	const filled: SparseNutritionDay[] = [];
	let cursor = from;
	// Safety cap (summary max span is 93 days).
	for (let i = 0; i < 100; i++) {
		const existing = byDate.get(cursor);
		filled.push(
			existing ?? {
				date: cursor,
				energyKcal: 0,
				proteinG: 0,
				carbsG: 0,
				fatG: 0,
				entryCount: 0,
				coverageAvg: 0,
			},
		);
		if (cursor === to) break;
		cursor = addLocalIsoDays(cursor, 1);
	}
	return filled;
}

/** Local calendar YYYY-MM-DD (browser / Worker local TZ). */
export function localIsoDate(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function addLocalIsoDays(isoDate: string, days: number): string {
	const d = new Date(`${isoDate}T12:00:00`);
	d.setDate(d.getDate() + days);
	return localIsoDate(d);
}

export function nutritionRangeBounds(
	range: NutritionHubRange,
	today: string = localIsoDate(),
): { from: string; to: string } {
	return {
		from: addLocalIsoDays(today, -(range - 1)),
		to: today,
	};
}
