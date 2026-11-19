import { describe, expect, it } from "vitest";
import {
	cargoAddFuelMacros,
	manualFuelEntry,
	matchesTagDisplayNames,
	mealAddFuelMacros,
} from "../add-fuel";
import type { NutritionSnapshot } from "../types";

const density: NutritionSnapshot = {
	source: "usda",
	confidence: 0.9,
	verified: true,
	per100g: {
		energyKcal: 100,
		proteinG: 10,
		fatG: 5,
		carbG: 20,
		fiberG: null,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
	},
	perServing: null,
	fdcId: null,
	description: null,
};

describe("add fuel", () => {
	it("filters by tag display name and ignores a slug-only mismatch", () => {
		const tags = [{ name: "Weeknight", slug: "weeknight" }];
		expect(matchesTagDisplayNames(tags, [])).toBe(true);
		expect(matchesTagDisplayNames(tags, ["Weeknight"])).toBe(true);
		expect(matchesTagDisplayNames(tags, ["weeknight"])).toBe(false);
		expect(matchesTagDisplayNames(tags, ["Breakfast", "Weeknight"])).toBe(
			true,
		);
	});

	it("scales one ounce through per 100 g and posts carbG as carbsG", () => {
		const macros = cargoAddFuelMacros({
			nutrition: density,
			quantity: 1,
			unit: "oz",
		});
		expect(macros).toEqual({
			energyKcal: (100 * 28.3495) / 100,
			proteinG: (10 * 28.3495) / 100,
			carbsG: (20 * 28.3495) / 100,
			fatG: (5 * 28.3495) / 100,
		});
	});

	it("multiplies a meal's per-serving macros by servings", () => {
		expect(
			mealAddFuelMacros(
				{ energyKcal: 200, proteinG: 12, carbsG: 18, fatG: 8 },
				2,
			),
		).toEqual({
			energyKcal: 400,
			proteinG: 24,
			carbsG: 36,
			fatG: 16,
		});
		expect(
			mealAddFuelMacros(
				{ energyKcal: 200, proteinG: 12, carbsG: 18, fatG: 8 },
				0,
			),
		).toBeNull();
	});

	it("keeps a typed entry and refuses a blank name or a negative macro", () => {
		expect(
			manualFuelEntry({
				name: "  Soup  ",
				amount: 1.5,
				unit: "bowl",
				energyKcal: 120,
				proteinG: 4,
				carbsG: 10,
				fatG: 6,
				tagNames: [" Weeknight ", ""],
			}),
		).toEqual({
			name: "Soup",
			amount: 1.5,
			unit: "bowl",
			macros: { energyKcal: 120, proteinG: 4, carbsG: 10, fatG: 6 },
			tagNames: ["Weeknight"],
		});
		expect(
			manualFuelEntry({
				name: " ",
				amount: 1,
				unit: "serving",
				energyKcal: 1,
				proteinG: 0,
				carbsG: 0,
				fatG: 0,
				tagNames: [],
			}),
		).toBeNull();
		expect(
			manualFuelEntry({
				name: "Soup",
				amount: 1,
				unit: "serving",
				energyKcal: 1,
				proteinG: -1,
				carbsG: 0,
				fatG: 0,
				tagNames: [],
			}),
		).toBeNull();
		expect(
			manualFuelEntry({
				name: "Soup",
				amount: 1,
				unit: "serving",
				energyKcal: 1,
				proteinG: 0,
				carbsG: 0,
				fatG: 0,
				tagNames: Array.from({ length: 11 }, (_, index) => `Tag ${index}`),
			}),
		).toBeNull();
		expect(
			manualFuelEntry({
				name: "Soup",
				amount: 1,
				unit: "serving",
				energyKcal: 1,
				proteinG: 0,
				carbsG: 0,
				fatG: 0,
				tagNames: ["a".repeat(101)],
			}),
		).toBeNull();
	});
});
