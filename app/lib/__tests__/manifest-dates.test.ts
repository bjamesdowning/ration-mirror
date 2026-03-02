import { describe, expect, it } from "vitest";
import {
	addDays,
	getCalendarDates,
	getDayName,
	getWeekDates,
	getWeekEnd,
	getWeekStart,
	toISODateString,
} from "~/lib/manifest-dates";

describe("toISODateString", () => {
	it("formats a date as YYYY-MM-DD", () => {
		expect(toISODateString(new Date("2025-01-05T00:00:00"))).toBe("2025-01-05");
		expect(toISODateString(new Date("2025-12-31T00:00:00"))).toBe("2025-12-31");
	});
});

describe("getWeekStart", () => {
	it("returns Sunday as week start with sunday preference", () => {
		// 2025-01-08 is a Wednesday
		expect(getWeekStart("2025-01-08", "sunday")).toBe("2025-01-05"); // Sunday Jan 5
	});

	it("returns Monday as week start with monday preference", () => {
		// 2025-01-08 is a Wednesday
		expect(getWeekStart("2025-01-08", "monday")).toBe("2025-01-06"); // Monday Jan 6
	});

	it("handles a Sunday as the input date (sunday pref)", () => {
		// 2025-01-05 is a Sunday -> week starts that same Sunday
		expect(getWeekStart("2025-01-05", "sunday")).toBe("2025-01-05");
	});

	it("handles a Sunday as the input date (monday pref)", () => {
		// 2025-01-05 is a Sunday -> week starts previous Monday (Dec 30)
		expect(getWeekStart("2025-01-05", "monday")).toBe("2024-12-30");
	});

	it("handles a Monday as the input date (monday pref)", () => {
		// 2025-01-06 is a Monday -> week starts that same Monday
		expect(getWeekStart("2025-01-06", "monday")).toBe("2025-01-06");
	});

	it("defaults to sunday when weekStart is omitted", () => {
		expect(getWeekStart("2025-01-08")).toBe("2025-01-05");
	});
});

describe("getWeekEnd", () => {
	it("returns 6 days after the start date", () => {
		expect(getWeekEnd("2025-01-05")).toBe("2025-01-11"); // Sun Jan 5 + 6 = Sat Jan 11
	});

	it("wraps across month boundaries", () => {
		expect(getWeekEnd("2025-01-29")).toBe("2025-02-04");
	});
});

describe("getWeekDates", () => {
	it("returns exactly 7 dates", () => {
		const dates = getWeekDates("2025-01-05");
		expect(dates).toHaveLength(7);
	});

	it("first date equals the start date", () => {
		expect(getWeekDates("2025-01-05")[0]).toBe("2025-01-05");
	});

	it("last date is 6 days after start", () => {
		const dates = getWeekDates("2025-01-05");
		expect(dates[6]).toBe("2025-01-11");
	});

	it("dates are sequential with no gaps", () => {
		const dates = getWeekDates("2025-01-27");
		for (let i = 1; i < dates.length; i++) {
			const prev = new Date(dates[i - 1]);
			const curr = new Date(dates[i]);
			expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
		}
	});

	it("wraps across month and year boundaries", () => {
		const dates = getWeekDates("2024-12-29");
		expect(dates[2]).toBe("2024-12-31");
		expect(dates[3]).toBe("2025-01-01");
	});
});

describe("getDayName", () => {
	it("returns full day name by default", () => {
		expect(getDayName("2025-01-05")).toBe("Sunday"); // Jan 5 2025 is a Sunday
		expect(getDayName("2025-01-06")).toBe("Monday");
		expect(getDayName("2025-01-11")).toBe("Saturday");
	});

	it("returns short day name when short=true", () => {
		expect(getDayName("2025-01-05", true)).toBe("Sun");
		expect(getDayName("2025-01-06", true)).toBe("Mon");
		expect(getDayName("2025-01-11", true)).toBe("Sat");
	});
});

describe("addDays", () => {
	it("adds positive days", () => {
		expect(addDays("2025-01-05", 1)).toBe("2025-01-06");
		expect(addDays("2025-01-05", 5)).toBe("2025-01-10");
	});

	it("subtracts with negative days", () => {
		expect(addDays("2025-01-05", -1)).toBe("2025-01-04");
		expect(addDays("2025-01-05", -7)).toBe("2024-12-29");
	});

	it("wraps across month and year boundaries", () => {
		expect(addDays("2025-01-29", 5)).toBe("2025-02-03");
		expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
	});
});

describe("getCalendarDates", () => {
	describe("3-day span", () => {
		it("returns 3 consecutive days from anchor", () => {
			const dates = getCalendarDates(3, "2025-01-08", "sunday");
			expect(dates).toHaveLength(3);
			expect(dates[0]).toBe("2025-01-08");
			expect(dates[1]).toBe("2025-01-09");
			expect(dates[2]).toBe("2025-01-10");
		});
	});

	describe("5-day span", () => {
		it("returns 5 consecutive days from anchor (today + 4)", () => {
			const dates = getCalendarDates(5, "2025-01-06", "sunday"); // Monday
			expect(dates).toHaveLength(5);
			expect(dates[0]).toBe("2025-01-06"); // Mon
			expect(dates[4]).toBe("2025-01-10"); // Fri
		});
	});

	describe("7-day span", () => {
		it("returns full week Sunday-Saturday when weekStart is sunday", () => {
			const dates = getCalendarDates(7, "2025-01-08", "sunday"); // Wed
			expect(dates).toHaveLength(7);
			expect(dates[0]).toBe("2025-01-05"); // Sun
			expect(dates[6]).toBe("2025-01-11"); // Sat
		});

		it("returns full week Monday-Sunday when weekStart is monday", () => {
			const dates = getCalendarDates(7, "2025-01-08", "monday"); // Wed
			expect(dates).toHaveLength(7);
			expect(dates[0]).toBe("2025-01-06"); // Mon
			expect(dates[6]).toBe("2025-01-12"); // Sun
		});
	});
});
