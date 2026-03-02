import { describe, expect, it } from "vitest";
import { getScaleFactor, scaleQuantity } from "~/lib/scale";

describe("getScaleFactor", () => {
	it("returns correct scale factor for halving", () => {
		expect(getScaleFactor(4, 2)).toBe(0.5);
	});

	it("returns correct scale factor for doubling", () => {
		expect(getScaleFactor(4, 8)).toBe(2);
	});

	it("returns 1 when desired equals base", () => {
		expect(getScaleFactor(4, 4)).toBe(1);
	});

	it("returns 1 when mealServings is 0 (guard against divide-by-zero)", () => {
		expect(getScaleFactor(0, 4)).toBe(1);
	});

	it("returns 1 when mealServings is negative", () => {
		expect(getScaleFactor(-2, 4)).toBe(1);
	});

	it("handles fractional servings", () => {
		expect(getScaleFactor(4, 6)).toBeCloseTo(1.5);
	});
});

describe("scaleQuantity", () => {
	it("rounds continuous units to 2 decimal places", () => {
		expect(scaleQuantity(100, 1.5, "g")).toBe(150);
		expect(scaleQuantity(1, 1 / 3, "ml")).toBe(0.33);
	});

	it("rounds count units to nearest integer", () => {
		expect(scaleQuantity(2, 1.5, "piece")).toBe(3);
		expect(scaleQuantity(4, 0.5, "clove")).toBe(2);
	});

	it("enforces minimum of 1 for count units when original > 0", () => {
		// 1 piece * 0.1 = 0.1, rounds to 0, but enforces min 1
		expect(scaleQuantity(1, 0.1, "piece")).toBe(1);
		expect(scaleQuantity(1, 0.1, "can")).toBe(1);
		expect(scaleQuantity(1, 0.1, "unit")).toBe(1);
	});

	it("allows 0 for count units when original is 0", () => {
		expect(scaleQuantity(0, 2, "piece")).toBe(0);
	});

	it("handles all count unit types", () => {
		const countUnits = [
			"unit",
			"piece",
			"dozen",
			"can",
			"pack",
			"bunch",
			"clove",
			"slice",
			"head",
			"stalk",
			"sprig",
		];
		for (const unit of countUnits) {
			expect(scaleQuantity(3, 2, unit)).toBe(6);
		}
	});

	it("uses continuous rounding when unit is undefined", () => {
		expect(scaleQuantity(1, 1 / 3)).toBe(0.33);
	});

	it("is case-insensitive for unit matching", () => {
		expect(scaleQuantity(3, 2, "PIECE")).toBe(6);
		expect(scaleQuantity(3, 2, "Can")).toBe(6);
	});
});
