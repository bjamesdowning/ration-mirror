import { describe, expect, it } from "vitest";
import {
	buildMonthGrid,
	collectPlannedDotDates,
	getMonthBounds,
	HISTORY_KEPT_TITLE,
	historyRetentionCutoffDate,
	isCalendarDaySelectable,
	MANIFEST_HISTORY_RETENTION_DAYS,
	parseYearMonth,
	shiftYearMonth,
} from "~/lib/manifest-calendar";

describe("historyRetentionCutoffDate", () => {
	it("is 396 days before today by default", () => {
		expect(historyRetentionCutoffDate("2026-08-09")).toBe("2025-07-09");
	});

	it("accepts a custom retention window", () => {
		expect(historyRetentionCutoffDate("2026-08-09", 30)).toBe("2026-07-10");
	});
});

describe("isCalendarDaySelectable", () => {
	const today = "2026-08-09";

	it("allows today and future dates", () => {
		expect(isCalendarDaySelectable(today, today)).toBe(true);
		expect(isCalendarDaySelectable("2026-12-01", today)).toBe(true);
	});

	it("allows past dates inside the retention window", () => {
		expect(isCalendarDaySelectable("2025-07-09", today)).toBe(true);
		expect(isCalendarDaySelectable("2026-01-01", today)).toBe(true);
	});

	it("disables past dates older than retention", () => {
		expect(isCalendarDaySelectable("2025-07-08", today)).toBe(false);
		expect(isCalendarDaySelectable("2024-01-01", today)).toBe(false);
	});

	it("uses custom retention days", () => {
		expect(isCalendarDaySelectable("2026-07-10", today, 30)).toBe(true);
		expect(isCalendarDaySelectable("2026-07-09", today, 30)).toBe(false);
	});
});

describe("collectPlannedDotDates", () => {
	it("returns distinct sorted dates", () => {
		expect(
			collectPlannedDotDates(["2026-08-03", "2026-08-01", "2026-08-03"]),
		).toEqual(["2026-08-01", "2026-08-03"]);
	});

	it("returns empty for no entries", () => {
		expect(collectPlannedDotDates([])).toEqual([]);
	});
});

describe("month helpers", () => {
	it("parses year/month from ISO date", () => {
		expect(parseYearMonth("2026-08-09")).toEqual({ year: 2026, month: 8 });
	});

	it("returns inclusive month bounds", () => {
		expect(getMonthBounds(2026, 2)).toEqual({
			from: "2026-02-01",
			to: "2026-02-28",
		});
		expect(getMonthBounds(2024, 2)).toEqual({
			from: "2024-02-01",
			to: "2024-02-29",
		});
	});

	it("builds a sunday-start August 2026 grid covering the month", () => {
		const grid = buildMonthGrid(2026, 8, "sunday");
		expect(grid[0]).toBe("2026-07-26");
		expect(grid).toContain("2026-08-01");
		expect(grid).toContain("2026-08-31");
		expect(grid.length % 7).toBe(0);
		expect(grid[grid.length - 1]).toBe("2026-09-05");
	});

	it("builds a monday-start grid", () => {
		const grid = buildMonthGrid(2026, 8, "monday");
		expect(grid[0]).toBe("2026-07-27");
		expect(grid.length % 7).toBe(0);
	});

	it("shifts year/month across year boundaries", () => {
		expect(shiftYearMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
		expect(shiftYearMonth(2025, 12, 1)).toEqual({ year: 2026, month: 1 });
	});

	it("exports retention constants used by the overlay title", () => {
		expect(MANIFEST_HISTORY_RETENTION_DAYS).toBe(396);
		expect(HISTORY_KEPT_TITLE).toBe("History kept for 13 months");
	});
});
