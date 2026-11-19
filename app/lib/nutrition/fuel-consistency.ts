import { previousUtcCalendarDay } from "./goal-effective";

/** Integer quarter of a logged macro. Null means the cell stays unmarked. */
export type FuelShadeLevel = 1 | 2 | 3 | 4;

/**
 * Shade after rounding grams and the goal with `Math.round` (the same
 * integers as `Int(value.rounded())`). The server does not send this level.
 * A day that is not logged, or a goal that is not positive, stays unmarked.
 */
export function fuelMacroShade(
	actual: number,
	goal: number,
	logged: boolean,
): FuelShadeLevel | null {
	if (!logged) return null;
	if (!Number.isFinite(actual) || !Number.isFinite(goal)) return null;
	const roundedActual = Math.round(actual);
	const roundedGoal = Math.round(goal);
	if (roundedGoal <= 0) return null;
	if (roundedActual * 4 <= roundedGoal) return 1;
	if (roundedActual * 2 < roundedGoal) return 2;
	if (roundedActual * 4 < roundedGoal * 3) return 3;
	return 4;
}

/**
 * Seven UTC dates, oldest first, with `selected` last.
 * Walks `previousUtcCalendarDay` rather than a calendar week.
 */
export function fuelConsistencyDates(selected: string): string[] {
	const dates = [selected];
	let cursor = selected;
	for (let step = 0; step < 6; step++) {
		const previous = previousUtcCalendarDay(cursor);
		if (!previous) break;
		dates.unshift(previous);
		cursor = previous;
	}
	return dates;
}
