import { describe, expect, it } from "vitest";
import { computeMealNutrition } from "~/lib/nutrition/compute-meal-nutrition";
import { gramsPerServingFromSnapshot } from "~/lib/nutrition/intake-amount";
import type { NutrientsPer100g, NutrientValues } from "~/lib/nutrition/types";

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
		expect(result.recipeMassG).toBe(110);
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
		expect(result.recipeMassG).toBe(200);
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
		expect(result.recipeMassG).toBe(100);
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
		expect(result.recipeMassG).toBeNull();
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
		expect(result.recipeMassG).toBeNull();
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
		expect(result.recipeMassG).toBeNull();
	});

	it("drops recipe mass when a contributing line has no grams", () => {
		const rice: NutrientsPer100g = {
			energyKcal: 130,
			proteinG: 2.7,
			fatG: 0.3,
			carbG: 28,
			fiberG: 0.4,
			sugarG: 0,
			satFatG: 0.1,
			sodiumMg: 1,
			saltG: 0,
		};
		const egg: NutrientValues = {
			energyKcal: 155,
			proteinG: 13,
			fatG: 11,
			carbG: 1.1,
			fiberG: 0,
			sugarG: 0,
			satFatG: 3.3,
			sodiumMg: 124,
			saltG: 0.3,
		};
		const result = computeMealNutrition([
			{
				name: "rice",
				quantity: 200,
				unit: "g",
				nutrientsPer100g: rice,
			},
			{
				name: "egg",
				quantity: 2,
				unit: "unit",
				nutrientsPer100g: null,
				directContribution: egg,
			},
		]);

		expect(result.perServing.energyKcal).toBeCloseTo(260 + 155, 5);
		expect(result.perServing.proteinG).toBeCloseTo(2.7 * 2 + 13, 5);
		expect(result.attributions[0]?.grams).toBe(200);
		expect(result.attributions[1]?.grams).toBeNull();
		expect(result.recipeMassG).toBeNull();
		expect(
			gramsPerServingFromSnapshot(
				{
					recipeMassG: result.recipeMassG,
					attributions: result.attributions,
				},
				1,
			),
		).toBeNull();
	});
});
