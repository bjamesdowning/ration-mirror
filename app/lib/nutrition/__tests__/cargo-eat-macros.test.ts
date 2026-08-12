import { describe, expect, it } from "vitest";
import { scaleCargoEatMacros } from "../cargo-eat-macros";
import type { NutritionSnapshot } from "../types";

const density: NutritionSnapshot = {
	source: "usda",
	confidence: 0.9,
	verified: true,
	per100g: {
		energyKcal: 89,
		proteinG: 1.1,
		fatG: 0.3,
		carbG: 23,
		fiberG: 2.6,
		sugarG: 12,
		satFatG: null,
		sodiumMg: 1,
		saltG: null,
	},
	perServing: null,
	fdcId: 9040,
	description: "banana",
};

const household: NutritionSnapshot = {
	...density,
	perServing: {
		energyKcal: 105,
		proteinG: 1.3,
		fatG: 0.4,
		carbG: 27,
		fiberG: 3.1,
		sugarG: 14,
		satFatG: null,
		sodiumMg: 1,
		saltG: null,
	},
};

const packageTotals: NutritionSnapshot = {
	source: "user_override",
	confidence: 1,
	verified: true,
	per100g: null,
	perServing: {
		energyKcal: 300,
		proteinG: 20,
		fatG: 10,
		carbG: 30,
		fiberG: null,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
	},
	fdcId: null,
	description: null,
};

describe("scaleCargoEatMacros", () => {
	it("scales mass from per100g", () => {
		const macros = scaleCargoEatMacros({
			nutrition: density,
			quantity: 200,
			unit: "g",
		});
		expect(macros.energyKcal).toBeCloseTo(178, 5);
		expect(macros.carbG).toBeCloseTo(46, 5);
	});

	it("scales count from household perServing", () => {
		const macros = scaleCargoEatMacros({
			nutrition: household,
			quantity: 2,
			unit: "unit",
		});
		expect(macros.energyKcal).toBe(210);
	});

	it("divides package totals by stock for overrides", () => {
		const macros = scaleCargoEatMacros({
			nutrition: packageTotals,
			quantity: 1,
			unit: "can",
			packageQuantity: 3,
		});
		expect(macros.energyKcal).toBe(100);
	});

	it("does not invent macros from density-only count stock", () => {
		const macros = scaleCargoEatMacros({
			nutrition: density,
			quantity: 1,
			unit: "unit",
		});
		expect(macros).toEqual({
			energyKcal: null,
			proteinG: null,
			carbG: null,
			fatG: null,
		});
	});
});
