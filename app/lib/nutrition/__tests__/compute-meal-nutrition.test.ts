import { describe, expect, it } from "vitest";
import { computeMealNutrition } from "~/lib/nutrition/compute-meal-nutrition";
import type { NutrientsPer100g } from "~/lib/nutrition/types";

const ONION: NutrientsPer100g = {
	energyKcal: 40,
	proteinG: 1.1,
	fatG: 0.1,
	carbG: 9.3,
	fiberG: 1.7,
	sugarG: 4.2,
	satFatG: 0.04,
	sodiumMg: 4,
	saltG: 0.01,
};

const OIL: NutrientsPer100g = {
	energyKcal: 884,
	proteinG: 0,
	fatG: 100,
	carbG: 0,
	fiberG: 0,
	sugarG: 0,
	satFatG: 13.8,
	sodiumMg: 2,
	saltG: 0.005,
};

describe("computeMealNutrition", () => {
	it("aggregates matched ingredients into per-serving totals", () => {
		const result = computeMealNutrition(
			[
				{
					name: "onion",
					quantity: 100,
					unit: "g",
					nutrientsPer100g: ONION,
					fdcId: 1005,
					source: "usda",
				},
				{
					name: "olive oil",
					quantity: 10,
					unit: "g",
					nutrientsPer100g: OIL,
					fdcId: 1006,
					source: "usda",
				},
			],
			2,
		);

		expect(result.coverage).toBe(1);
		expect(result.attributions).toHaveLength(2);
		// Total: 40 + 88.4 = 128.4 kcal → per serving 64.2
		expect(result.perServing.energyKcal).toBeCloseTo(64.2, 5);
		expect(result.perServing.fatG).toBeCloseTo(5.05, 5);
	});

	it("reduces coverage when an ingredient with mass is unresolved", () => {
		const result = computeMealNutrition([
			{
				name: "onion",
				quantity: 100,
				unit: "g",
				nutrientsPer100g: ONION,
			},
			{
				name: "mystery sauce",
				quantity: 100,
				unit: "g",
				nutrientsPer100g: null,
			},
		]);

		expect(result.coverage).toBe(0.5);
		expect(result.attributions).toHaveLength(1);
		expect(result.perServing.energyKcal).toBe(40);
	});

	it("ignores ingredients that cannot convert to grams", () => {
		const result = computeMealNutrition([
			{
				name: "onion",
				quantity: 100,
				unit: "g",
				nutrientsPer100g: ONION,
			},
			{
				name: "bay leaf",
				quantity: 2,
				unit: "piece",
				nutrientsPer100g: null,
			},
		]);

		expect(result.coverage).toBe(1);
		expect(result.attributions).toHaveLength(1);
	});

	it("uses precomputed grams when provided", () => {
		const result = computeMealNutrition([
			{
				name: "onion",
				quantity: null,
				unit: null,
				grams: 200,
				nutrientsPer100g: ONION,
			},
		]);

		expect(result.perServing.energyKcal).toBe(80);
		expect(result.coverage).toBe(1);
	});

	it("returns empty result for empty ingredient list", () => {
		const result = computeMealNutrition([]);
		expect(result.coverage).toBe(0);
		expect(result.perServing.energyKcal).toBe(0);
		expect(result.attributions).toEqual([]);
	});

	it("aggregates directContribution for count units without grams", () => {
		const result = computeMealNutrition([
			{
				name: "mini watermelon",
				quantity: 1,
				unit: "unit",
				nutrientsPer100g: null,
				directContribution: {
					energyKcal: 90,
					proteinG: 2,
					fatG: 0.5,
					carbG: 22,
					fiberG: 1,
					sugarG: 18,
					satFatG: 0,
					sodiumMg: 5,
					saltG: 0,
				},
			},
		]);

		expect(result.perServing.energyKcal).toBe(90);
		expect(result.coverage).toBe(1);
		expect(result.attributions).toHaveLength(1);
		expect(result.attributions[0]?.grams).toBeNull();
	});

	it("uses directContribution when count unit has density but no grams", () => {
		const result = computeMealNutrition([
			{
				name: "mini watermelon",
				quantity: 1,
				unit: "unit",
				nutrientsPer100g: ONION,
				directContribution: {
					energyKcal: 90,
					proteinG: 2,
					fatG: 0.5,
					carbG: 22,
					fiberG: 1,
					sugarG: 18,
					satFatG: 0,
					sodiumMg: 5,
					saltG: 0,
				},
			},
		]);

		expect(result.perServing.energyKcal).toBe(90);
		expect(result.coverage).toBe(1);
	});
});
