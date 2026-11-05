import { describe, expect, it } from "vitest";
import { computeBaseFields, effectiveBaseFields } from "~/lib/base-quantity";
import {
	buildCargoIndex,
	getAvailableQuantityWithMap,
	strictMatch,
} from "~/lib/matching.server";
import { computeMealNutrition } from "~/lib/nutrition/compute-meal-nutrition";
import { agreedCountUnitPortionGrams } from "~/lib/nutrition/override-scale";
import { convertIngredientAmountToGrams } from "~/lib/nutrition/scale-nutrients";
import type { NutrientValues } from "~/lib/nutrition/types";
import { aggregateIngredients } from "~/lib/supply.server";
import {
	convertIngredientAmount,
	convertQuantity,
	getUnitFamily,
	isDiscreteCountFamily,
	toSupportedUnit,
} from "~/lib/units";

const IOS_COUNT_SPELLINGS = [
	"unit",
	"piece",
	"dozen",
	"bunch",
	"clove",
	"slice",
	"head",
	"stalk",
	"sprig",
	"can",
	"pack",
] as const;

function macros(
	energyKcal: number,
	proteinG: number,
	carbG: number,
	fatG: number,
): NutrientValues {
	return {
		energyKcal,
		proteinG,
		carbG,
		fatG,
		fiberG: 0,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
	};
}

describe("count families", () => {
	it("keeps dozen with unit and gives culinary nouns their own base", () => {
		expect(convertQuantity(1, "dozen", "unit")).toBe(12);
		expect(convertQuantity(3, "clove", "unit")).toBeNull();
		expect(convertQuantity(2, "slice", "head")).toBeNull();
		expect(getUnitFamily("clove")).toBe("count_clove");
		expect(getUnitFamily("slice")).toBe("count_slice");
		expect(getUnitFamily("head")).toBe("count_head");
	});

	it("keeps every iOS count spelling discrete", () => {
		for (const unit of IOS_COUNT_SPELLINGS) {
			expect(isDiscreteCountFamily(getUnitFamily(unit))).toBe(true);
		}
	});

	it("reads bulb as a head and loaf as a pantry unit", () => {
		expect(toSupportedUnit("bulb")).toBe("head");
		expect(toSupportedUnit("bulbs")).toBe("head");
		expect(toSupportedUnit("loaf")).toBe("unit");
		expect(toSupportedUnit("loaves")).toBe("unit");
	});

	it("heals a stored unit base for cloves on read", () => {
		expect(effectiveBaseFields(3, "clove", 3, "unit", "garlic")).toEqual({
			baseQuantity: 3,
			baseUnit: "clove",
		});
	});
});

describe("count bridges", () => {
	it("does not convert cloves to a generic unit", () => {
		expect(convertIngredientAmount(3, "clove", "unit", "onion")).toBeNull();
		expect(convertIngredientAmount(3, "clove", "unit", "shallot")).toBeNull();
		expect(convertIngredientAmount(1, "dozen", "clove", "onion")).toBeNull();
	});

	it("converts garlic cloves to a head or bulb and not to grams", () => {
		expect(convertIngredientAmount(1, "head", "clove", "garlic")).toBe(10);
		expect(convertIngredientAmount(3, "clove", "head", "garlic")).toBeCloseTo(
			0.3,
			5,
		);
		expect(
			convertIngredientAmount(1, toSupportedUnit("bulb"), "clove", "garlic"),
		).toBe(10);
		expect(convertIngredientAmount(1, "unit", "clove", "garlic")).toBe(10);
		expect(convertIngredientAmount(1, "dozen", "clove", "garlic")).toBe(120);
		expect(convertIngredientAmount(3, "clove", "g", "garlic")).toBeNull();
		expect(convertIngredientAmountToGrams(3, "clove", "garlic")).toBeNull();
		expect(
			convertIngredientAmount(1, "head", "clove", "garlic powder"),
		).toBeNull();
	});

	it("converts bread slices to a loaf", () => {
		expect(convertIngredientAmount(20, "slice", "unit", "bread")).toBe(1);
		expect(
			convertIngredientAmount(
				4,
				"slice",
				toSupportedUnit("loaf"),
				"sourdough bread",
			),
		).toBeCloseTo(0.2, 5);
		expect(
			convertIngredientAmount(1, "unit", "slice", "whole wheat bread"),
		).toBe(20);
		expect(convertIngredientAmount(20, "slice", "unit", "bread crumbs")).toBe(
			20,
		);
	});

	it("converts celery stalks and herb sprigs", () => {
		expect(convertIngredientAmount(8, "stalk", "head", "celery")).toBe(1);
		expect(convertIngredientAmount(1, "unit", "stalk", "celery")).toBe(8);
		expect(convertIngredientAmount(10, "sprig", "bunch", "basil")).toBe(1);
		expect(convertIngredientAmount(1, "unit", "sprig", "thyme")).toBe(10);
		expect(
			convertIngredientAmount(1, "bunch", "sprig", "coriander seeds"),
		).toBeNull();
	});

	it("still treats a head of lettuce and a slice of cheese as one item", () => {
		expect(convertIngredientAmount(1, "head", "unit", "lettuce")).toBe(1);
		expect(convertIngredientAmount(2, "unit", "slice", "cheddar")).toBe(2);
		expect(convertIngredientAmount(1, "slice", "head", "tomato")).toBeNull();
	});
});

describe("cookability and supply", () => {
	const makeMeal = (id: string) => ({
		id,
		organizationId: "org-1",
		name: `Meal ${id}`,
		domain: "food",
		type: "recipe",
		description: null,
		directions: null,
		equipment: null,
		servings: 1,
		prepTime: null,
		cookTime: null,
		customFields: null,
		nutrition: null,
		nutritionRevision: 0,
		nutritionComputedRevision: 0,
		nutritionStatus: "current" as const,
		nutritionUpdatedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	const makeIngredient = (
		mealId: string,
		name: string,
		quantity: number,
		unit: string,
	) => {
		const base = computeBaseFields(quantity, unit, name);
		return {
			id: `${mealId}-${name}`,
			mealId,
			cargoId: null,
			ingredientName: name,
			quantity,
			unit,
			baseQuantity: base.baseQuantity,
			baseUnit: base.baseUnit,
			isOptional: false,
			orderIndex: 0,
		};
	};

	it("counts 1 head of garlic as 10 cloves", () => {
		const index = buildCargoIndex([
			{ id: "g", name: "Garlic", quantity: 1, unit: "head", domain: "food" },
		]);
		expect(
			getAvailableQuantityWithMap("garlic", "clove", index, new Map()),
		).toBe(10);
		const results = strictMatch(
			[
				{
					meal: makeMeal("m"),
					ingredients: [makeIngredient("m", "garlic", 3, "clove")],
					tags: [],
				},
			],
			index,
			new Map(),
		);
		expect(results[0]?.canMake).toBe(true);
		expect(results[0]?.availableIngredients[0]?.availableQuantity).toBe(10);
	});

	it("treats unmatched clove stock as present instead of zero", () => {
		const index = buildCargoIndex([
			{ id: "o", name: "Onion", quantity: 1, unit: "unit", domain: "food" },
		]);
		expect(
			getAvailableQuantityWithMap("onion", "clove", index, new Map()),
		).toBe(0);
		const results = strictMatch(
			[
				{
					meal: makeMeal("m"),
					ingredients: [makeIngredient("m", "onion", 3, "clove")],
					tags: [],
				},
			],
			index,
			new Map(),
		);
		expect(results).toHaveLength(1);
		expect(results[0]?.canMake).toBe(true);
		expect(
			results[0]?.availableIngredients[0]?.availableQuantity,
		).toBeGreaterThanOrEqual(3);
	});

	it("does not treat a missing ingredient as present", () => {
		const index = buildCargoIndex([]);
		const results = strictMatch(
			[
				{
					meal: makeMeal("m"),
					ingredients: [makeIngredient("m", "garlic", 3, "clove")],
					tags: [],
				},
			],
			index,
			new Map(),
		);
		expect(results).toHaveLength(0);
	});

	it("merges garlic cloves and a head onto one supply line", () => {
		const rows = [
			ingredientRow("garlic", 1, "head"),
			ingredientRow("garlic", 3, "clove"),
		];
		const result = aggregateIngredients(rows, "metric");
		expect(result).toHaveLength(1);
		const line = result[0];
		expect(line).toBeDefined();
		if (!line) return;
		const asCloves = convertIngredientAmount(
			line.quantity,
			line.unit,
			"clove",
			"garlic",
		);
		expect(asCloves).toBeCloseTo(13, 5);
	});

	it("keeps a single garlic bulb as one head", () => {
		const result = aggregateIngredients(
			[ingredientRow("Garlic", 1, "head")],
			"metric",
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.quantity).toBe(1);
		expect(result[0]?.unit).toBe("head");
	});

	it("merges bread slices and a loaf onto one supply line", () => {
		const result = aggregateIngredients(
			[
				ingredientRow("Bread", 1, "loaf"),
				ingredientRow("sliced bread", 4, "slice"),
			],
			"metric",
		);
		expect(result).toHaveLength(1);
		const line = result[0];
		expect(line).toBeDefined();
		if (!line) return;
		expect(
			convertIngredientAmount(line.quantity, line.unit, "slice", "bread"),
		).toBeCloseTo(24, 5);
	});

	it("does not merge onion cloves with onion units", () => {
		const result = aggregateIngredients(
			[ingredientRow("Onion", 1, "unit"), ingredientRow("Onion", 3, "clove")],
			"metric",
		);
		expect(result).toHaveLength(2);
	});

	it("does not invent grams when a clove mass link is confirmed", () => {
		const per100g = macros(100, 10, 12, 4);
		const perServing = macros(50, 5, 6, 2);
		const grams = agreedCountUnitPortionGrams(per100g, perServing, 3);
		expect(grams).toBe(150);
		const meal = computeMealNutrition(
			[
				{
					name: "garlic",
					quantity: 3,
					unit: "clove",
					nutrientsPer100g: per100g,
					grams,
				},
			],
			1,
		);
		expect(meal.recipeMassG).toBe(150);
		expect(meal.perServing.energyKcal).toBeCloseTo(150, 5);
	});
});

function ingredientRow(name: string, quantity: number, unit: string) {
	const base = computeBaseFields(quantity, unit, name);
	return {
		meal_ingredient: {
			mealId: "meal-1",
			ingredientName: name,
			quantity,
			unit,
			baseQuantity: base.baseQuantity,
			baseUnit: base.baseUnit,
		},
		meal_domain: "food" as const,
		supplyOrigin: "galley" as const,
	};
}
