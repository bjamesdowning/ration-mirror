import { describe, expect, it } from "vitest";
import {
	cargoPackageSizeChanged,
	scaleCargoNutritionToPackage,
} from "../package-scale";
import type { NutritionSnapshot } from "../types";

const milkPer100g = {
	energyKcal: 42,
	proteinG: 3.4,
	fatG: 1,
	carbG: 5,
	fiberG: 0,
	sugarG: 5,
	satFatG: 0.6,
	sodiumMg: 44,
	saltG: 0.1,
};

const usdaMilk: NutritionSnapshot = {
	source: "usda",
	confidence: 1,
	verified: true,
	per100g: milkPer100g,
	perServing: null,
	fdcId: 1097510,
	description: "Milk, whole",
};

describe("scaleCargoNutritionToPackage", () => {
	it("scales per100g to 1 L milk package totals", () => {
		const next = scaleCargoNutritionToPackage(usdaMilk, 1, "l", "milk");
		expect(next.perServing).not.toBeNull();
		expect(next.perServing?.energyKcal).toBeGreaterThan(400);
		expect(next.perServing?.energyKcal).toBeLessThan(650);
		expect(next.per100g?.energyKcal).toBe(42);
	});

	it("updates package totals when qty changes and per100g exists", () => {
		const oneLiter = scaleCargoNutritionToPackage(usdaMilk, 1, "l", "milk");
		const halfLiter = scaleCargoNutritionToPackage(oneLiter, 0.5, "l", "milk", {
			previousQuantity: 1,
			previousUnit: "l",
		});
		expect(halfLiter.perServing?.energyKcal).toBeCloseTo(
			(oneLiter.perServing?.energyKcal ?? 0) / 2,
			5,
		);
	});

	it("clears perServing when new package mass is unknown", () => {
		const withPackage = scaleCargoNutritionToPackage(usdaMilk, 1, "l", "milk");
		const next = scaleCargoNutritionToPackage(withPackage, 1, "unit", "milk", {
			previousQuantity: 1,
			previousUnit: "l",
		});
		expect(next.per100g?.energyKcal).toBe(42);
		expect(next.perServing).toBeNull();
	});

	it("keeps override package totals when correcting unit→liter without prior mass", () => {
		const override: NutritionSnapshot = {
			source: "user_override",
			confidence: 1,
			verified: true,
			per100g: null,
			perServing: {
				...milkPer100g,
				energyKcal: 500,
			},
			fdcId: null,
			description: null,
		};
		const next = scaleCargoNutritionToPackage(override, 1, "l", "milk", {
			previousQuantity: 1,
			previousUnit: "unit",
		});
		expect(next.perServing?.energyKcal).toBe(500);
		expect(next.per100g?.energyKcal).toBeCloseTo(500 * (100 / 1030), 0);
	});

	it("derives density from old package then scales to new size for overrides", () => {
		const override: NutritionSnapshot = {
			source: "user_override",
			confidence: 1,
			verified: true,
			per100g: null,
			perServing: {
				...milkPer100g,
				energyKcal: 500,
			},
			fdcId: null,
			description: null,
		};
		const next = scaleCargoNutritionToPackage(override, 0.5, "l", "milk", {
			previousQuantity: 1,
			previousUnit: "l",
		});
		expect(next.perServing?.energyKcal).toBeCloseTo(250, 0);
	});
});

describe("cargoPackageSizeChanged", () => {
	it("detects qty or unit changes", () => {
		expect(cargoPackageSizeChanged(1, "unit", 1, "l")).toBe(true);
		expect(cargoPackageSizeChanged(1, "l", 2, "l")).toBe(true);
		expect(cargoPackageSizeChanged(1, "l", 1, "l")).toBe(false);
	});
});
