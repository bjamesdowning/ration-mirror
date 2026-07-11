/**
 * Pure date helpers for manifest (week/day math). Safe to use on client and server.
 * Server-only manifest logic stays in ~/lib/manifest.server.
 */

/** Returns today as YYYY-MM-DD using local date arithmetic. */
export function getTodayISO(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Given a YYYY-MM-DD date string and a weekStart preference, returns the Sunday/Monday that starts that week. */
export function getWeekStart(
	date: string,
	weekStart: "sunday" | "monday" = "sunday",
): string {
	const d = new Date(`${date}T00:00:00`);
	const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
	const offset = weekStart === "monday" ? (day === 0 ? 6 : day - 1) : day;
	d.setDate(d.getDate() - offset);
	return toISODateString(d);
}

/** Returns the end of a week (6 days after start). */
export function getWeekEnd(startDate: string): string {
	const d = new Date(`${startDate}T00:00:00`);
	d.setDate(d.getDate() + 6);
	return toISODateString(d);
}

export function toISODateString(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Day name helpers
// ---------------------------------------------------------------------------

const DAY_NAMES_LONG = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

const DAY_NAMES_SHORT = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat",
] as const;

/**
 * Returns the name of the day for a YYYY-MM-DD date string.
 * Uses local midnight parsing to avoid UTC offset shifts.
 */
export function getDayName(dateStr: string, short = false): string {
	const d = new Date(`${dateStr}T00:00:00`);
	return short ? DAY_NAMES_SHORT[d.getDay()] : DAY_NAMES_LONG[d.getDay()];
}

/** Returns an array of 7 YYYY-MM-DD strings for the week starting at startDate. */
export function getWeekDates(startDate: string): string[] {
	const dates: string[] = [];
	const d = new Date(`${startDate}T00:00:00`);
	for (let i = 0; i < 7; i++) {
		dates.push(toISODateString(d));
		d.setDate(d.getDate() + 1);
	}
	return dates;
}

/** Add days to a YYYY-MM-DD date string. */
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00`);
	d.setDate(d.getDate() + days);
	return toISODateString(d);
}

/**
 * Returns an array of YYYY-MM-DD strings for the calendar span.
 * - 3 / 5: anchorDate is the first visible day; returns [anchor, anchor+1, ..., anchor+(span-1)].
 * - 7: anchorDate can be any day; returns the full week (Sunday-Saturday or Monday-Sunday per weekStartPref).
 */
export function getCalendarDates(
	span: 3 | 5 | 7,
	anchorDate: string,
	weekStartPref: "sunday" | "monday",
): string[] {
	if (span === 7) {
		const start = getWeekStart(anchorDate, weekStartPref);
		return getWeekDates(start);
	}
	const dates: string[] = [];
	const d = new Date(`${anchorDate}T00:00:00`);
	for (let i = 0; i < span; i++) {
		dates.push(toISODateString(d));
		d.setDate(d.getDate() + 1);
	}
	return dates;
}

import {
	SUPPLY_MANIFEST_HORIZON_DEFAULT,
	SUPPLY_MANIFEST_HORIZON_MAX,
	SUPPLY_MANIFEST_HORIZON_MIN,
} from "./schemas/org-supply-settings";
import type { OrganizationMetadata } from "./types";

export const SUPPLY_MANIFEST_HORIZON = {
	min: SUPPLY_MANIFEST_HORIZON_MIN,
	max: SUPPLY_MANIFEST_HORIZON_MAX,
	default: SUPPLY_MANIFEST_HORIZON_DEFAULT,
} as const;

/** Resolves how many forward days of Manifest entries feed Supply sync. */
export function resolveManifestHorizonDays(
	orgMetadata: OrganizationMetadata | null | undefined,
): number {
	const raw = orgMetadata?.supplySettings?.manifestHorizonDays;
	if (
		typeof raw === "number" &&
		Number.isInteger(raw) &&
		raw >= SUPPLY_MANIFEST_HORIZON.min &&
		raw <= SUPPLY_MANIFEST_HORIZON.max
	) {
		return raw;
	}
	return SUPPLY_MANIFEST_HORIZON.default;
}

/** Resolves the manifest date range used for Supply sync (org-scoped, forward-looking). */
export function resolveSupplyManifestWindow(
	orgMetadata: OrganizationMetadata | null | undefined,
	today = getTodayISO(),
): { startDate: string; endDate: string; horizonDays: number } {
	const horizonDays = resolveManifestHorizonDays(orgMetadata);
	return {
		startDate: today,
		endDate: addDays(today, horizonDays - 1),
		horizonDays,
	};
}

export type ManifestSupplyWindowDefaults = {
	weekStart?: "sunday" | "monday";
	calendarSpan?: 3 | 5 | 7;
};

/**
 * @deprecated Use resolveSupplyManifestWindow with organization.metadata instead.
 */
export function resolveManifestSupplyWindow(
	settings:
		| {
				manifestSettings?: {
					weekStart?: "sunday" | "monday";
					calendarSpan?: 3 | 5 | 7;
				};
		  }
		| null
		| undefined,
	today = getTodayISO(),
	defaults: ManifestSupplyWindowDefaults = {
		weekStart: "sunday",
		calendarSpan: 5,
	},
): { startDate: string; endDate: string } {
	const weekStart =
		settings?.manifestSettings?.weekStart ?? defaults.weekStart ?? "sunday";
	const calendarSpan =
		settings?.manifestSettings?.calendarSpan ?? defaults.calendarSpan ?? 5;
	const anchor = calendarSpan === 7 ? getWeekStart(today, weekStart) : today;
	const dates = getCalendarDates(calendarSpan, anchor, weekStart);
	return { startDate: dates[0], endDate: dates[dates.length - 1] };
}
