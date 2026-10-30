import { previousUtcCalendarDay } from "./goal-effective";

/** Inclusive calendar-day count, or null when either bound is not a real date. */
export function inclusiveUtcSpanDays(from: string, to: string): number | null {
	if (from > to) return null;
	let count = 1;
	let cursor = from;
	while (cursor < to) {
		const next = addUtcCalendarDays(cursor, 1);
		if (!next) return null;
		cursor = next;
		count += 1;
		if (count > 400) return null;
	}
	return count;
}

/**
 * The span of equal length that ends the day before `from`.
 * Week, month, and custom ranges all compare against this window.
 */
export function previousEqualCalendarRange(
	from: string,
	to: string,
): { from: string; to: string } | null {
	const span = inclusiveUtcSpanDays(from, to);
	if (span == null) return null;
	const previousTo = previousUtcCalendarDay(from);
	if (!previousTo) return null;
	const previousFrom = addUtcCalendarDays(previousTo, -(span - 1));
	if (!previousFrom) return null;
	return { from: previousFrom, to: previousTo };
}

function addUtcCalendarDays(date: string, days: number): string | null {
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
	utc.setUTCDate(utc.getUTCDate() + days);
	const y = utc.getUTCFullYear();
	if (y < 1) return null;
	const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
	const d = String(utc.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
