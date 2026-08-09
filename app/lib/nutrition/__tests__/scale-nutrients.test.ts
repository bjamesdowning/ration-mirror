import { describe, expect, it } from "vitest";
import {
	addNutrients,
	convertIngredientAmountToGrams,
	emptyNutrients,
	nutrientsPerServingFromTotal,
	scaleNutrientsPer100g,
} from "~/lib/nutrition/scale-nutrients";
import type { NutrientsPer100g } from "~/lib/nutrition/types";

const CHICKEN: NutrientsPer100g = {
	energyKcal: 120,
	proteinG: 22.5,
	fatG: 2.6,
	carbG: 0,
	fiberG: 0,
	sugarG: 0,
	satFatG: 0.6,
	sodiumMg: 45,
	saltG: 0.11,
};

describe("scaleNutrientsPer100g", () => {
	it("scales linearly by grams", () => {
		const half = scaleNutrientsPer100g(CHICKEN, 50);
		expect(half.energyKcal).toBe(60);
		expect(half.proteinG).toBe(11.25);
		expect(half.fatG).toBe(1.3);
	});

	it("returns zeros for non-positive grams", () => {
		expect(scaleNutrientsPer100g(CHICKEN, 0)).toEqual(emptyNutrients());
		expect(scaleNutrientsPer100g(CHICKEN, -10)).toEqual(emptyNutrients());
	});
});

describe("convertIngredientAmountToGrams", () => {
	it("converts weight units without density", () => {
		expect(convertIngredientAmountToGrams(1, "kg", "flour")).toBe(1000);
		expect(convertIngredientAmountToGrams(2, "oz", "butter")).toBeCloseTo(
			56.699,
			1,
		);
	});

	it("converts volume via density when known", () => {
		const grams = convertIngredientAmountToGrams(1, "cup", "olive oil");
		expect(grams).not.toBeNull();
		if (grams === null) return;
		expect(grams).toBeGreaterThan(200);
	});

	it("returns null for unconvertible count units", () => {
		expect(convertIngredientAmountToGrams(2, "piece", "onion")).toBeNull();
	});
});

describe("nutrientsPerServingFromTotal", () => {
	it("divides totals by servings", () => {
		const total = scaleNutrientsPer100g(CHICKEN, 200);
		const per = nutrientsPerServingFromTotal(total, 2);
		expect(per.energyKcal).toBe(120);
		expect(per.proteinG).toBe(22.5);
	});

	it("guards zero servings", () => {
		expect(nutrientsPerServingFromTotal(CHICKEN, 0)).toEqual(emptyNutrients());
	});
});

describe("addNutrients", () => {
	it("sums nutrient fields", () => {
		const a = scaleNutrientsPer100g(CHICKEN, 100);
		const b = scaleNutrientsPer100g(CHICKEN, 100);
		const sum = addNutrients(a, b);
		expect(sum.energyKcal).toBe(240);
		expect(sum.proteinG).toBe(45);
	});
});
