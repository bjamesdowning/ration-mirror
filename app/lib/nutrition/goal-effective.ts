/** Inclusive YYYY-MM-DD date range for a nutrition goal version. */
export type GoalEffectiveRange = {
	effectiveFrom: string;
	effectiveTo: string | null;
};

/**
 * Whether a goal version applies on a UTC calendar date (YYYY-MM-DD).
 * `effectiveFrom` is inclusive; `effectiveTo` is inclusive when set.
 */
export function isGoalEffectiveOnDate(
	goal: GoalEffectiveRange,
	date: string,
): boolean {
	if (date < goal.effectiveFrom) return false;
	if (goal.effectiveTo != null && date > goal.effectiveTo) return false;
	return true;
}

/**
 * Day before `date` (YYYY-MM-DD), used when closing a prior open-ended goal.
 * Returns null when `date` is not a valid calendar date or has no prior day
 * in a practical range (year < 1).
 */
export function previousUtcCalendarDay(date: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const utc = new Date(Date.UTC(year, month - 1, day));
	if (
		utc.getUTCFullYear() !== year ||
		utc.getUTCMonth() !== month - 1 ||
		utc.getUTCDate() !== day
	) {
		return null;
	}
	utc.setUTCDate(utc.getUTCDate() - 1);
	const y = utc.getUTCFullYear();
	const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
	const d = String(utc.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/**
 * Retention cutoff: `now` minus `retentionDays` as a Date.
 * Default retention is ~13 months (396 days).
 */
export function nutritionIntakeRetentionCutoff(
	now: Date,
	retentionDays = 396,
): Date {
	const cutoff = new Date(now.getTime());
	cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
	return cutoff;
}
