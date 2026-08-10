import { describe, expect, it } from "vitest";
import {
	nutrientsPer100gFromCargoOverride,
	nutrientsPer100gFromPackageTotals,
	pickBestCargoOverrideForIngredient,
	withDerivedPer100g,
} from "../override-scale";
import type { NutritionSnapshot } from "../types";

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
