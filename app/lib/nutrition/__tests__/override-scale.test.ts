import { describe, expect, it } from "vitest";
import { computeMealNutrition } from "../compute-meal-nutrition";
import {
	canLogIntakeByMass,
	gramsPerServingFromSnapshot,
} from "../intake-amount";
import {
	agreedCountUnitPortionGrams,
	agreedGramsPerCountUnit,
	directNutrientsFromCountCargoOverride,
	estimateGramsFromPerServingDensity,
	nutrientsPer100gFromCargoOverride,
	nutrientsPer100gFromPackageTotals,
	pickBestCargoOverrideForIngredient,
	resolveCountUnitMealContribution,
	withDerivedPer100g,
} from "../override-scale";
import type { NutrientValues, NutritionSnapshot } from "../types";

const milkPackageTotals = {
	energyKcal: 500,
	proteinG: 34,
	fatG: 20,
	carbG: 48,
	fiberG: 0,
	sugarG: 48,
	satFatG: 12,
	sodiumMg: 400,
	saltG: 1,
};

const milkOverride: NutritionSnapshot = {
	source: "user_override",
	confidence: 1,
	verified: true,
	per100g: null,
	perServing: milkPackageTotals,
	fdcId: null,
	description: null,
};

describe("nutrientsPer100gFromPackageTotals", () => {
	it("scales package totals to per 100 g", () => {
		const per100 = nutrientsPer100gFromPackageTotals(milkPackageTotals, 1030);
		expect(per100?.energyKcal).toBeCloseTo(500 * (100 / 1030), 5);
	});

	it("returns null for non-positive grams", () => {
		expect(nutrientsPer100gFromPackageTotals(milkPackageTotals, 0)).toBeNull();
		expect(
			nutrientsPer100gFromPackageTotals(milkPackageTotals, null),
		).toBeNull();
	});
});

describe("nutrientsPer100gFromCargoOverride", () => {
	it("prefers stored per100g", () => {
		const snap: NutritionSnapshot = {
			...milkOverride,
			per100g: {
				...milkPackageTotals,
				energyKcal: 42,
			},
		};
		const per100 = nutrientsPer100gFromCargoOverride(snap, 1, "l", "milk");
		expect(per100?.energyKcal).toBe(42);
	});

	it("derives from 1L milk package totals", () => {
		const per100 = nutrientsPer100gFromCargoOverride(
			milkOverride,
			1,
			"l",
			"milk",
		);
		expect(per100).not.toBeNull();
		// milk density ~1.03 g/ml → 1030 g; 500 kcal / 10.3 ≈ 48.5
		expect(per100?.energyKcal).toBeGreaterThan(40);
		expect(per100?.energyKcal).toBeLessThan(55);
	});

	it("returns null when package mass cannot be derived", () => {
		expect(
			nutrientsPer100gFromCargoOverride(milkOverride, 1, null, "milk"),
		).toBeNull();
	});
});

describe("withDerivedPer100g", () => {
	it("fills per100g when missing and mass known", () => {
		const next = withDerivedPer100g(milkOverride, 1, "l", "milk");
		expect(next.per100g).not.toBeNull();
		expect(next.perServing?.energyKcal).toBe(500);
	});
});

describe("pickBestCargoOverrideForIngredient", () => {
	const candidates = [
		{
			id: "a",
			name: "milk chocolate granola",
			quantity: 500,
			unit: "g",
			nutrition: milkOverride,
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		{
			id: "b",
			name: "milk",
			quantity: 1,
			unit: "l",
			nutrition: milkOverride,
			updatedAt: "2026-02-01T00:00:00.000Z",
		},
		{
			id: "c",
			name: "whole milk",
			quantity: 2,
			unit: "l",
			nutrition: { ...milkOverride, source: "usda" as const },
			updatedAt: "2026-03-01T00:00:00.000Z",
		},
	];

	it("prefers linked cargoId even when names differ", () => {
		const best = pickBestCargoOverrideForIngredient("milk", candidates, "a");
		expect(best?.id).toBe("a");
	});

	it("exact dedup match beats granola embed", () => {
		const best = pickBestCargoOverrideForIngredient("milk", candidates);
		expect(best?.id).toBe("b");
	});

	it("accepts usda density when no override exists", () => {
		const usdaOnly = candidates.filter((c) => c.id === "c");
		const best = pickBestCargoOverrideForIngredient("whole milk", usdaOnly);
		expect(best?.id).toBe("c");
		expect(best?.nutrition.source).toBe("usda");
	});

	it("override beats USDA when both match the same name", () => {
		const both = [
			{
				id: "b",
				name: "whole milk",
				quantity: 1,
				unit: "l",
				nutrition: milkOverride,
				updatedAt: "2026-02-01T00:00:00.000Z",
			},
			{
				id: "c",
				name: "whole milk",
				quantity: 2,
				unit: "l",
				nutrition: { ...milkOverride, source: "usda" as const },
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
		];
		const best = pickBestCargoOverrideForIngredient("whole milk", both);
		expect(best?.id).toBe("b");
		expect(best?.nutrition.source).toBe("user_override");
	});

	it("override beats wrong USDA conceptually (caller prefers override when present)", () => {
		const overrideOnly = [
			{
				id: "milk-cargo",
				name: "milk",
				quantity: 1,
				unit: "l",
				nutrition: milkOverride,
				updatedAt: Date.now(),
			},
		];
		const best = pickBestCargoOverrideForIngredient("milk", overrideOnly);
		expect(best).not.toBeNull();
		const per100 = nutrientsPer100gFromCargoOverride(
			best?.nutrition ?? milkOverride,
			best?.quantity ?? 1,
			"l",
			"milk",
		);
		// Manual 500 kcal/L ≈ 48 kcal/100g, not chocolate ~466
		expect(per100?.energyKcal).toBeLessThan(100);
	});
});

describe("pickBestCargoOverrideForIngredient nutrition identity", () => {
	const density: NutritionSnapshot = {
		source: "user_override",
		confidence: 1,
		verified: true,
		per100g: { ...milkPackageTotals, energyKcal: 130 },
		perServing: null,
		fdcId: null,
		description: null,
	};

	function namedCargo(id: string, name: string) {
		return {
			id,
			name,
			quantity: 100,
			unit: "g",
			nutrition: density,
			updatedAt: "2026-04-01T00:00:00.000Z",
		};
	}

	it("does not apply cooked, raw, or dried cargo to a different state", () => {
		const candidates = [
			namedCargo("raw", "raw rice"),
			namedCargo("plain", "rice"),
			namedCargo("cooked", "cooked rice"),
			namedCargo("dried", "dried basil"),
			namedCargo("fresh", "fresh basil"),
		];
		expect(
			pickBestCargoOverrideForIngredient("cooked rice", candidates)?.id,
		).toBe("cooked");
		expect(pickBestCargoOverrideForIngredient("raw rice", candidates)?.id).toBe(
			"raw",
		);
		expect(pickBestCargoOverrideForIngredient("rice", candidates)?.id).toBe(
			"plain",
		);
		expect(
			pickBestCargoOverrideForIngredient("dried basil", candidates)?.id,
		).toBe("dried");
		expect(
			pickBestCargoOverrideForIngredient("fresh basil", candidates)?.id,
		).toBe("fresh");
		expect(
			pickBestCargoOverrideForIngredient("basil", [
				namedCargo("dried", "dried basil"),
			]),
		).toBeNull();
	});

	it("does not apply leaf cilantro to spice coriander", () => {
		const candidates = [
			namedCargo("leaf", "cilantro"),
			namedCargo("ground-leaf", "ground cilantro"),
			namedCargo("spice", "ground coriander"),
			namedCargo("seeds", "coriander seeds"),
		];
		expect(
			pickBestCargoOverrideForIngredient("ground coriander", candidates)?.id,
		).toBe("spice");
		expect(
			pickBestCargoOverrideForIngredient("coriander seeds", candidates)?.id,
		).toBe("seeds");
		expect(
			pickBestCargoOverrideForIngredient("coriander", candidates)?.id,
		).toBe("leaf");
		expect(
			pickBestCargoOverrideForIngredient("cilantro", [
				namedCargo("spice", "ground coriander"),
				namedCargo("seeds", "coriander seeds"),
			]),
		).toBeNull();
	});

	it("lines beef mince up with ground beef and keeps minced garlic as garlic", () => {
		const candidates = [
			namedCargo("ground-beef", "ground beef"),
			namedCargo("beef", "beef"),
			namedCargo("garlic", "garlic"),
			namedCargo("ground-garlic", "ground garlic"),
		];
		expect(
			pickBestCargoOverrideForIngredient("beef mince", candidates)?.id,
		).toBe("ground-beef");
		expect(
			pickBestCargoOverrideForIngredient("minced garlic", candidates)?.id,
		).toBe("garlic");
		expect(
			pickBestCargoOverrideForIngredient("minced beef", candidates)?.id,
		).toBe("beef");
		expect(
			pickBestCargoOverrideForIngredient("minced garlic", [
				namedCargo("ground-garlic", "ground garlic"),
			]),
		).toBeNull();
	});

	it("still prefers an explicit cargo link over a different food name", () => {
		const linked = namedCargo("linked-raw", "raw rice");
		const best = pickBestCargoOverrideForIngredient(
			"cooked rice",
			[linked, namedCargo("cooked", "cooked rice")],
			"linked-raw",
		);
		expect(best?.id).toBe("linked-raw");
	});
});

describe("estimateGramsFromPerServingDensity", () => {
	it("scales household energy against per100g density", () => {
		const grams = estimateGramsFromPerServingDensity(
			{ ...milkPackageTotals, energyKcal: 50 },
			{ ...milkPackageTotals, energyKcal: 75 },
			2,
		);
		// 75/50 * 100 = 150g per portion × 2
		expect(grams).toBe(300);
	});

	it("returns null without positive energy", () => {
		expect(
			estimateGramsFromPerServingDensity(
				{ ...milkPackageTotals, energyKcal: 0 },
				milkPackageTotals,
				1,
			),
		).toBeNull();
	});
});

describe("directNutrientsFromCountCargoOverride", () => {
	it("uses perServing as one count unit for USDA household", () => {
		const snap: NutritionSnapshot = {
			source: "usda",
			confidence: 0.9,
			verified: false,
			per100g: { ...milkPackageTotals, energyKcal: 30 },
			perServing: { ...milkPackageTotals, energyKcal: 90 },
			fdcId: 1,
			description: null,
		};
		const direct = directNutrientsFromCountCargoOverride(
			snap,
			1,
			"unit",
			3,
			"unit",
		);
		expect(direct?.energyKcal).toBe(90);
	});

	it("divides user_override package totals by package quantity", () => {
		const snap: NutritionSnapshot = {
			source: "user_override",
			confidence: 1,
			verified: true,
			per100g: null,
			perServing: { ...milkPackageTotals, energyKcal: 300 },
			fdcId: null,
			description: null,
		};
		const direct = directNutrientsFromCountCargoOverride(
			snap,
			1,
			"unit",
			3,
			"unit",
		);
		expect(direct?.energyKcal).toBe(100);
	});

	it("returns null for mass units", () => {
		expect(
			directNutrientsFromCountCargoOverride(milkOverride, 100, "g", 1, "g"),
		).toBeNull();
	});

	it("accepts can/pack discrete count families", () => {
		const snap: NutritionSnapshot = {
			source: "user_override",
			confidence: 1,
			verified: true,
			per100g: null,
			perServing: { ...milkPackageTotals, energyKcal: 400 },
			fdcId: null,
			description: null,
		};
		const oneCan = directNutrientsFromCountCargoOverride(
			snap,
			1,
			"can",
			2,
			"can",
		);
		expect(oneCan?.energyKcal).toBe(200);
		const onePack = directNutrientsFromCountCargoOverride(
			snap,
			1,
			"pack",
			4,
			"pack",
		);
		expect(onePack?.energyKcal).toBe(100);
	});

	it("still rolls a clove line up from perServing", () => {
		const snap: NutritionSnapshot = {
			source: "user_override",
			confidence: 1,
			verified: true,
			per100g: null,
			perServing: { ...milkPackageTotals, energyKcal: 40 },
			fdcId: null,
			description: null,
		};
		const twoCloves = directNutrientsFromCountCargoOverride(
			snap,
			2,
			"clove",
			1,
			"clove",
		);
		expect(twoCloves?.energyKcal).toBe(80);
	});
});

describe("resolveCountUnitMealContribution", () => {
	it("rolls perServing protein through and does not invent 420 g", () => {
		const snapshot: NutritionSnapshot = {
			source: "user_override",
			confidence: 1,
			verified: true,
			per100g: {
				energyKcal: 10,
				proteinG: 0,
				fatG: 0,
				carbG: 0,
				fiberG: 0,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			},
			perServing: {
				energyKcal: 42,
				proteinG: 1,
				fatG: 0,
				carbG: 0,
				fiberG: 0,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			},
			fdcId: null,
			description: null,
		};
		const resolved = resolveCountUnitMealContribution({
			snapshot,
			ingredientQuantity: 1,
			ingredientUnit: "unit",
			packageQuantity: 1,
			packageUnit: "unit",
		});
		expect(resolved?.directContribution.proteinG).toBe(1);
		expect(resolved?.warning).toContain("perServing");
		const meal = computeMealNutrition(
			[
				{
					name: "egg",
					quantity: 1,
					unit: "unit",
					nutrientsPer100g: null,
					directContribution: resolved?.directContribution ?? null,
				},
			],
			1,
		);
		expect(meal.perServing.proteinG).toBe(1);
		expect(meal.recipeMassG).toBeNull();
		expect(snapshot.per100g).not.toBeNull();
		expect(snapshot.perServing).not.toBeNull();
		if (snapshot.per100g && snapshot.perServing) {
			expect(
				agreedGramsPerCountUnit(snapshot.per100g, snapshot.perServing),
			).toBeNull();
		}
		expect(
			gramsPerServingFromSnapshot(
				{
					attributions: meal.attributions,
					recipeMassG: meal.recipeMassG,
				},
				1,
			),
		).toBeNull();
	});

	it("keeps 150 g when perServing matches per100g on every macro", () => {
		const per100g = countMacros({
			energyKcal: 100,
			proteinG: 10,
			carbG: 12,
			fatG: 4,
		});
		const perServing = countMacros({
			energyKcal: 150,
			proteinG: 15,
			carbG: 18,
			fatG: 6,
		});
		expect(agreedGramsPerCountUnit(per100g, perServing)).toBe(150);
		expect(agreedCountUnitPortionGrams(per100g, perServing, 2)).toBe(300);
		const snapshot: NutritionSnapshot = {
			source: "user_override",
			confidence: 1,
			verified: true,
			per100g,
			perServing,
			fdcId: null,
			description: null,
		};
		expect(
			resolveCountUnitMealContribution({
				snapshot,
				ingredientQuantity: 1,
				ingredientUnit: "unit",
				packageQuantity: 1,
				packageUnit: "unit",
			}),
		).toBeNull();
		const meal = computeMealNutrition(
			[
				{
					name: "yogurt",
					quantity: 1,
					unit: "unit",
					nutrientsPer100g: per100g,
					grams: agreedCountUnitPortionGrams(per100g, perServing, 1),
				},
			],
			1,
		);
		expect(meal.recipeMassG).toBe(150);
		expect(meal.perServing.energyKcal).toBeCloseTo(150, 5);
		expect(meal.perServing.proteinG).toBeCloseTo(15, 5);
		expect(meal.perServing.carbG).toBeCloseTo(18, 5);
		expect(meal.perServing.fatG).toBeCloseTo(6, 5);
		const gramsPerServing = gramsPerServingFromSnapshot(
			{
				attributions: meal.attributions,
				recipeMassG: meal.recipeMassG,
			},
			1,
		);
		expect(gramsPerServing).toBe(150);
		expect(canLogIntakeByMass(gramsPerServing)).toBe(true);
	});

	it("treats a zero density beside a positive portion as a disagreement", () => {
		const per100g = countMacros({
			energyKcal: 100,
			proteinG: 0,
			carbG: 10,
			fatG: 2,
		});
		const perServing = countMacros({
			energyKcal: 150,
			proteinG: 1,
			carbG: 15,
			fatG: 3,
		});
		expect(agreedGramsPerCountUnit(per100g, perServing)).toBeNull();
		const snapshot: NutritionSnapshot = {
			source: "user_override",
			confidence: 1,
			verified: true,
			per100g,
			perServing,
			fdcId: null,
			description: null,
		};
		const resolved = resolveCountUnitMealContribution({
			snapshot,
			ingredientQuantity: 1,
			ingredientUnit: "unit",
			packageQuantity: 1,
			packageUnit: "unit",
		});
		expect(resolved?.directContribution.energyKcal).toBe(150);
		expect(resolved?.directContribution.proteinG).toBe(1);
		expect(resolved?.warning).toContain("perServing");
	});

	it("skips macros that are zero on both sides", () => {
		const per100g = countMacros({
			energyKcal: 100,
			proteinG: 0,
			carbG: 0,
			fatG: 0,
		});
		const perServing = countMacros({
			energyKcal: 150,
			proteinG: 0,
			carbG: 0,
			fatG: 0,
		});
		expect(agreedGramsPerCountUnit(per100g, perServing)).toBe(150);
	});

	it("allows a small gram difference between macros", () => {
		const per100g = countMacros({
			energyKcal: 100,
			proteinG: 10,
			carbG: 12,
			fatG: 4,
		});
		const perServing = countMacros({
			energyKcal: 150,
			proteinG: 15.04,
			carbG: 18,
			fatG: 6,
		});
		expect(agreedGramsPerCountUnit(per100g, perServing)).toBe(150);
	});

	it("rejects macro ratios that imply different gram weights", () => {
		const per100g = countMacros({
			energyKcal: 100,
			proteinG: 10,
			carbG: 12,
			fatG: 4,
		});
		const perServing = countMacros({
			energyKcal: 150,
			proteinG: 20,
			carbG: 18,
			fatG: 6,
		});
		expect(agreedGramsPerCountUnit(per100g, perServing)).toBeNull();
	});

	it("lets a confirmed clove mass link win over any count bridge", () => {
		const per100g = countMacros({
			energyKcal: 100,
			proteinG: 10,
			carbG: 12,
			fatG: 4,
		});
		const perServing = countMacros({
			energyKcal: 50,
			proteinG: 5,
			carbG: 6,
			fatG: 2,
		});
		expect(agreedGramsPerCountUnit(per100g, perServing)).toBe(50);
		expect(
			resolveCountUnitMealContribution({
				snapshot: {
					source: "user_override",
					confidence: 1,
					verified: true,
					per100g,
					perServing,
					fdcId: null,
					description: null,
				},
				ingredientQuantity: 3,
				ingredientUnit: "clove",
				packageQuantity: 1,
				packageUnit: "clove",
			}),
		).toBeNull();
	});
});

function countMacros(
	macros: Pick<NutrientValues, "energyKcal" | "proteinG" | "carbG" | "fatG">,
): NutrientValues {
	return {
		...macros,
		fiberG: 0,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
	};
}
