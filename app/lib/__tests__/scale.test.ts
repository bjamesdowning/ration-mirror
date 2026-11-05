import { describe, expect, it } from "vitest";
import {
	getScaleFactor,
	roundShoppingCountQuantity,
	scaleCookQuantity,
	scaleQuantity,
	scaleQuantityExact,
} from "~/lib/scale";
import { convertIngredientAmount } from "~/lib/units";

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

describe("scaleQuantityExact", () => {
	it("preserves fractional count quantities for supply aggregation", () => {
		expect(scaleQuantityExact(0.5, 1)).toBe(0.5);
		expect(scaleQuantity(0.5, 1, "unit")).toBe(1);
	});

	it("rounds continuous noise to 2dp", () => {
		expect(scaleQuantityExact(1, 1 / 3)).toBe(0.33);
	});
});

describe("scaleCookQuantity", () => {
	const oneOfFour = getScaleFactor(4, 1);

	it("deducts a fraction of a clove, slice, sprig, or stalk", () => {
		expect(scaleCookQuantity(1, oneOfFour, "clove")).toBe(0.25);
		expect(scaleCookQuantity(1, oneOfFour, "slice")).toBe(0.25);
		expect(scaleCookQuantity(1, oneOfFour, "sprig")).toBe(0.25);
		expect(scaleCookQuantity(1, oneOfFour, "stalk")).toBe(0.25);
		expect(scaleCookQuantity(1, oneOfFour, "Cloves")).toBe(0.25);
	});

	it("adds four one-serving cooks of one clove back to one clove", () => {
		const eachCook = scaleCookQuantity(1, oneOfFour, "clove");
		expect(eachCook * 4).toBe(1);
	});

	it("keeps a fractional clove through the garlic and bread bridges", () => {
		const clove = scaleCookQuantity(1, oneOfFour, "clove");
		const slice = scaleCookQuantity(1, oneOfFour, "slice");
		const stalk = scaleCookQuantity(1, oneOfFour, "stalk");
		const sprig = scaleCookQuantity(1, oneOfFour, "sprig");

		expect(
			convertIngredientAmount(clove, "clove", "head", "garlic"),
		).toBeCloseTo(0.025, 5);
		expect(
			convertIngredientAmount(slice, "slice", "unit", "bread"),
		).toBeCloseTo(0.0125, 5);
		expect(
			convertIngredientAmount(stalk, "stalk", "head", "celery"),
		).toBeCloseTo(0.03125, 5);
		expect(
			convertIngredientAmount(sprig, "sprig", "bunch", "parsley"),
		).toBeCloseTo(0.025, 5);

		const headEachCook = convertIngredientAmount(
			clove,
			"clove",
			"head",
			"garlic",
		);
		expect(headEachCook).toBeCloseTo(0.025, 5);
		expect((headEachCook ?? 0) * 4).toBeCloseTo(0.1, 5);
		expect(convertIngredientAmount(0.1, "head", "clove", "garlic")).toBeCloseTo(
			1,
			5,
		);
	});

	it("deducts at least one of a can, egg, pack, head, bunch, or dozen", () => {
		for (const unit of [
			"can",
			"unit",
			"piece",
			"pack",
			"dozen",
			"head",
			"bunch",
			"loaf",
		]) {
			expect(scaleCookQuantity(1, oneOfFour, unit)).toBe(1);
		}
		// A tenth of a can would round to 0; cook still takes one.
		expect(scaleCookQuantity(1, 0.1, "can")).toBe(1);
		expect(scaleCookQuantity(1, 0.1, "unit")).toBe(1);
		expect(scaleCookQuantity(1, 0.01, "cans")).toBe(1);
		expect(scaleCookQuantity(1, oneOfFour, "bulb")).toBe(1);
	});

	it("does not deduct zero of a whole item when the line quantity is above zero", () => {
		expect(scaleCookQuantity(1, 0.1, "can")).toBeGreaterThan(0);
		expect(scaleCookQuantity(1, 0.1, "piece")).toBeGreaterThan(0);
		expect(scaleCookQuantity(0, 4, "can")).toBe(0);
		expect(scaleCookQuantity(0, oneOfFour, "clove")).toBe(0);
	});

	it("leaves display and cookability on the whole-count minimum", () => {
		// MealDetail and matching call scaleQuantity, not scaleCookQuantity.
		expect(scaleQuantity(1, oneOfFour, "clove")).toBe(1);
		expect(scaleQuantity(1, oneOfFour, "can")).toBe(1);
		expect(scaleQuantity(1, oneOfFour, "unit")).toBe(1);
	});

	it("still scales grams exactly to 2 decimal places", () => {
		expect(scaleCookQuantity(100, 1.5, "g")).toBe(150);
		expect(scaleCookQuantity(1, 1 / 3, "ml")).toBe(0.33);
	});

	it("turns one fractional egg into one egg, then one twelfth of a dozen", () => {
		const egg = scaleCookQuantity(1, oneOfFour, "unit");
		expect(egg).toBe(1);
		expect(convertIngredientAmount(egg, "unit", "dozen", "egg")).toBeCloseTo(
			1 / 12,
			5,
		);
	});
});

describe("roundShoppingCountQuantity", () => {
	it("rounds summed fractional counts once", () => {
		expect(roundShoppingCountQuantity(0.5 + 0.5, "unit")).toBe(1);
		expect(roundShoppingCountQuantity(0.4, "unit")).toBe(1);
	});

	it("leaves continuous units at 2dp", () => {
		expect(roundShoppingCountQuantity(200.456, "g")).toBe(200.46);
	});
});
