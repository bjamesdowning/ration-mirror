import { describe, expect, it } from "vitest";
import {
	addUtcDays,
	computeDaysUntilExpiry,
	daysBetweenUtcDates,
	expiryDisplayStatus,
	getExpiredCargoBounds,
	getExpiringCargoBounds,
	getUtcTodayISO,
	isExpiredOnUtcCalendar,
	isExpiringWithinDays,
	parseUtcDateISO,
	toExpiryDateISO,
} from "~/lib/cargo-utils";

describe("UTC calendar expiry helpers", () => {
	const july13Afternoon = new Date("2026-07-13T16:34:00.000Z");
	const july13Midnight = new Date("2026-07-13T00:00:00.000Z");
	const july14Morning = new Date("2026-07-14T00:01:00.000Z");

	it("normalizes expiry timestamps to UTC calendar dates", () => {
		expect(toExpiryDateISO(july13Midnight)).toBe("2026-07-13");
		expect(getUtcTodayISO(july13Afternoon)).toBe("2026-07-13");
	});

	it("treats same-day expiry as not expired on the expiry calendar day", () => {
		expect(isExpiredOnUtcCalendar(july13Midnight, july13Afternoon)).toBe(false);
		expect(computeDaysUntilExpiry(july13Midnight, july13Afternoon)).toBe(0);
		expect(expiryDisplayStatus(july13Midnight, july13Afternoon)).toBe("today");
	});

	it("treats item as expired starting the next UTC calendar day", () => {
		expect(isExpiredOnUtcCalendar(july13Midnight, july14Morning)).toBe(true);
		expect(computeDaysUntilExpiry(july13Midnight, july14Morning)).toBe(-1);
		expect(expiryDisplayStatus(july13Midnight, july14Morning)).toBe("expired");
	});

	it("includes today through N-day window in isExpiringWithinDays", () => {
		expect(isExpiringWithinDays(july13Midnight, 7, july13Afternoon)).toBe(true);
		const july20 = parseUtcDateISO("2026-07-20");
		expect(isExpiringWithinDays(july20, 7, july13Afternoon)).toBe(true);
		const july21 = parseUtcDateISO("2026-07-21");
		expect(isExpiringWithinDays(july21, 7, july13Afternoon)).toBe(false);
	});

	it("computes signed day distance between calendar dates", () => {
		expect(daysBetweenUtcDates("2026-07-13", "2026-07-20")).toBe(7);
		expect(daysBetweenUtcDates("2026-07-20", "2026-07-13")).toBe(-7);
	});

	it("addUtcDays shifts calendar dates", () => {
		expect(addUtcDays("2026-07-13", 7)).toBe("2026-07-20");
		expect(addUtcDays("2026-07-13", -30)).toBe("2026-06-13");
	});

	it("getExpiringCargoBounds includes start of today through end of window", () => {
		const { startOfToday, endOfWindow } = getExpiringCargoBounds(
			7,
			july13Afternoon,
		);
		expect(startOfToday.toISOString()).toBe("2026-07-13T00:00:00.000Z");
		expect(endOfWindow.toISOString()).toBe("2026-07-20T00:00:00.000Z");
		expect(july13Midnight.getTime()).toBeGreaterThanOrEqual(
			startOfToday.getTime(),
		);
		expect(july13Midnight.getTime()).toBeLessThanOrEqual(endOfWindow.getTime());
	});

	it("getExpiredCargoBounds excludes today and limits lookback", () => {
		const { startOfToday, earliest } = getExpiredCargoBounds(30, july14Morning);
		expect(startOfToday.toISOString()).toBe("2026-07-14T00:00:00.000Z");
		expect(earliest.toISOString()).toBe("2026-06-14T00:00:00.000Z");
		expect(july13Midnight.getTime()).toBeLessThan(startOfToday.getTime());
		expect(july13Midnight.getTime()).toBeGreaterThanOrEqual(earliest.getTime());
	});
});
