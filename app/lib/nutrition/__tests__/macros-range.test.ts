import { describe, expect, it } from "vitest";
import {
	inclusiveUtcSpanDays,
	previousEqualCalendarRange,
} from "../macros-range";

describe("previousEqualCalendarRange", () => {
	it("steps back one equal week", () => {
		expect(inclusiveUtcSpanDays("2026-10-25", "2026-10-31")).toBe(7);
		expect(previousEqualCalendarRange("2026-10-25", "2026-10-31")).toEqual({
			from: "2026-10-18",
			to: "2026-10-24",
		});
	});

	it("uses the same number of days for a calendar month", () => {
		expect(inclusiveUtcSpanDays("2026-10-01", "2026-10-31")).toBe(31);
		expect(previousEqualCalendarRange("2026-10-01", "2026-10-31")).toEqual({
			from: "2026-08-31",
			to: "2026-09-30",
		});
	});

	it("rejects a reversed range", () => {
		expect(previousEqualCalendarRange("2026-10-31", "2026-10-01")).toBeNull();
	});
});
