/**
 * Pure Manifest month-calendar helpers (retention window, planned dots, grids).
 * Safe for client + unit tests.
 */

import { addDays, getWeekStart } from "~/lib/manifest-dates";

/** Aligns with kitchen_event / nutrition_intake retention (~13 months). */
export const MANIFEST_HISTORY_RETENTION_DAYS = 396;

export const HISTORY_KEPT_TITLE = "History kept for 13 months";

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** YYYY-MM-DD of the oldest selectable history day (inclusive). */
export function historyRetentionCutoffDate(
	today: string,
	retentionDays = MANIFEST_HISTORY_RETENTION_DAYS,
): string {
	return addDays(today, -retentionDays);
}

/**
 * Past dates strictly older than the retention window are muted/disabled.
 * Today and all future dates remain selectable for planning.
 */
export function isCalendarDaySelectable(
	date: string,
	today: string,
	retentionDays = MANIFEST_HISTORY_RETENTION_DAYS,
): boolean {
	if (date >= today) return true;
	const cutoff = historyRetentionCutoffDate(today, retentionDays);
	return date >= cutoff;
}

/** Distinct sorted dates that have ≥1 planned entry (green dots). */
export function collectPlannedDotDates(entryDates: Iterable<string>): string[] {
	return [...new Set(entryDates)].sort();
}

export function parseYearMonth(date: string): { year: number; month: number } {
	const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
	if (!match) {
		throw new Error(`Invalid date: ${date}`);
	}
	return { year: Number(match[1]), month: Number(match[2]) };
}

/** Inclusive first/last calendar day of a month (1–12). */
export function getMonthBounds(
	year: number,
	month: number,
): { from: string; to: string } {
	const lastDay = new Date(year, month, 0).getDate();
	return {
		from: `${year}-${pad2(month)}-01`,
		to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
	};
}

/**
 * Month grid of YYYY-MM-DD cells (leading/trailing days from adjacent months).
 * Always returns complete weeks aligned to `weekStartPref`.
 */
export function buildMonthGrid(
	year: number,
	month: number,
	weekStartPref: "sunday" | "monday" = "sunday",
): string[] {
	const { from, to } = getMonthBounds(year, month);
	const start = getWeekStart(from, weekStartPref);
	const dates: string[] = [];
	let cursor = start;
	for (let i = 0; i < 42; i++) {
		dates.push(cursor);
		cursor = addDays(cursor, 1);
		if (cursor > to && (i + 1) % 7 === 0) break;
	}
	return dates;
}

/** Shift a year/month by ±N months. */
export function shiftYearMonth(
	year: number,
	month: number,
	deltaMonths: number,
): { year: number; month: number } {
	const d = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
	return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
