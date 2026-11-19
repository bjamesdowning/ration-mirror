import { describe, expect, it } from "vitest";
import {
	fuelConsistencyDates,
	fuelMacroShade,
} from "~/lib/nutrition/fuel-consistency";

describe("fuelMacroShade", () => {
	it("uses the 100 g quarter boundaries", () => {
		const goal = 100;
		const table: Array<[number, 1 | 2 | 3 | 4]> = [
			[0, 1],
			[25, 1],
			[26, 2],
			[49, 2],
			[50, 3],
			[74, 3],
			[75, 4],
			[100, 4],
			[101, 4],
		];
		for (const [actual, shade] of table) {
			expect(fuelMacroShade(actual, goal, true)).toBe(shade);
		}
	});

	it("rounds before the quarter check when the goal is not divisible by 4", () => {
		expect(fuelMacroShade(2, 10, true)).toBe(1);
		expect(fuelMacroShade(2.6, 10, true)).toBe(2);
		expect(fuelMacroShade(3, 10, true)).toBe(2);
		expect(fuelMacroShade(5, 10, true)).toBe(3);
		expect(fuelMacroShade(7, 10, true)).toBe(3);
		expect(fuelMacroShade(8, 10, true)).toBe(4);
		expect(fuelMacroShade(0, 0.6, true)).toBe(1);
	});

	it("stays unmarked when the day is not logged or the goal is not positive", () => {
		expect(fuelMacroShade(80, 100, false)).toBeNull();
		expect(fuelMacroShade(0, 100, false)).toBeNull();
		expect(fuelMacroShade(10, 0, true)).toBeNull();
		expect(fuelMacroShade(10, -4, true)).toBeNull();
		expect(fuelMacroShade(10, 0.4, true)).toBeNull();
		expect(fuelMacroShade(Number.NaN, 100, true)).toBeNull();
	});

	it("gives a logged zero the slightest shade when the goal is positive", () => {
		expect(fuelMacroShade(0, 100, true)).toBe(1);
	});
});

describe("fuelConsistencyDates", () => {
	it("puts the selected day last and the six previous days before it", () => {
		expect(fuelConsistencyDates("2026-11-13")).toEqual([
			"2026-11-07",
			"2026-11-08",
			"2026-11-09",
			"2026-11-10",
			"2026-11-11",
			"2026-11-12",
			"2026-11-13",
		]);
		expect(fuelConsistencyDates("2026-03-02")).toEqual([
			"2026-02-24",
			"2026-02-25",
			"2026-02-26",
			"2026-02-27",
			"2026-02-28",
			"2026-03-01",
			"2026-03-02",
		]);
	});
});
