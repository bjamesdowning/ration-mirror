/**
 * Personal goal progress for Manifest (preference-driven, adherence-neutral).
 */

export type DayNutrientTotals = {
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	/** Intake rows do not store fiber yet — remains 0 until intake tracks it. */
	fiberG: number;
};

export type UserGoalTargets = {
	dailyEnergyKcal: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
	fiberG: number | null;
};

export type GoalProgressLine = {
	key: "energy" | "protein" | "carbs" | "fat" | "fiber";
	label: string;
	consumed: number;
	target: number;
	unit: "kcal" | "g";
};

const GOAL_LINE_ORDER: Array<{
	key: GoalProgressLine["key"];
	targetKey: keyof UserGoalTargets;
	consumedKey: keyof DayNutrientTotals;
	label: string;
	unit: GoalProgressLine["unit"];
}> = [
	{
		key: "energy",
		targetKey: "dailyEnergyKcal",
		consumedKey: "energyKcal",
		label: "kcal",
		unit: "kcal",
	},
	{
		key: "protein",
		targetKey: "proteinG",
		consumedKey: "proteinG",
		label: "protein",
		unit: "g",
	},
	{
		key: "carbs",
		targetKey: "carbsG",
		consumedKey: "carbsG",
		label: "carbs",
		unit: "g",
	},
	{
		key: "fat",
		targetKey: "fatG",
		consumedKey: "fatG",
		label: "fat",
		unit: "g",
	},
	{
		key: "fiber",
		targetKey: "fiberG",
		consumedKey: "fiberG",
		label: "fiber",
		unit: "g",
	},
];

export function emptyDayNutrientTotals(): DayNutrientTotals {
	return {
		energyKcal: 0,
		proteinG: 0,
		carbsG: 0,
		fatG: 0,
		fiberG: 0,
	};
}

export function goalTargetsFromRow(
	goal: {
		dailyEnergyKcal: number | null;
		proteinG: number | null;
		carbsG: number | null;
		fatG: number | null;
		fiberG: number | null;
	} | null,
): UserGoalTargets | null {
	if (!goal) return null;
	const targets: UserGoalTargets = {
		dailyEnergyKcal: goal.dailyEnergyKcal,
		proteinG: goal.proteinG,
		carbsG: goal.carbsG,
		fatG: goal.fatG,
		fiberG: goal.fiberG,
	};
	const hasAny = Object.values(targets).some(
		(v) => v != null && Number.isFinite(v),
	);
	return hasAny ? targets : null;
}

/**
 * Lines for nutrients the user set (target != null). Omits unset preferences.
 * Explicit 0 targets are included.
 */
export function selectGoalProgressLines(
	targets: UserGoalTargets | null,
	consumed: DayNutrientTotals,
): GoalProgressLine[] {
	if (!targets) return [];
	const lines: GoalProgressLine[] = [];
	for (const spec of GOAL_LINE_ORDER) {
		const target = targets[spec.targetKey];
		if (target == null || !Number.isFinite(target)) continue;
		const value = consumed[spec.consumedKey];
		lines.push({
			key: spec.key,
			label: spec.label,
			consumed: Number.isFinite(value) ? value : 0,
			target,
			unit: spec.unit,
		});
	}
	return lines;
}

/** Format "1,240 / 2,000" style labels (neutral framing). */
export function formatConsumedVsGoal(consumed: number, target: number): string {
	const fmt = (n: number) =>
		Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
	return `${fmt(consumed)} / ${fmt(target)}`;
}

/** Compact day-strip: "1,240 / 2,000 kcal · 95 / 200 g protein". */
export function formatGoalProgressStrip(lines: GoalProgressLine[]): string {
	return lines
		.map((line) => {
			const ratio = formatConsumedVsGoal(line.consumed, line.target);
			if (line.unit === "kcal") return `${ratio} kcal`;
			return `${ratio} g ${line.label}`;
		})
		.join(" · ");
}

export function hasAnyGoalTarget(targets: UserGoalTargets | null): boolean {
	return selectGoalProgressLines(targets, emptyDayNutrientTotals()).length > 0;
}
