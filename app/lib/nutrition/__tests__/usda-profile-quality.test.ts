import { describe, expect, it } from "vitest";
import type { NullableNutrientValues } from "../types";
import {
	atwaterKcalFromMacros,
	isUsdaNutrientProfileUsable,
} from "../usda-profile-quality";

function nutrients(
	partial: Partial<NullableNutrientValues>,
): NullableNutrientValues {
	return {
		energyKcal: null,
		proteinG: null,
		fatG: null,
		carbG: null,
		fiberG: null,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
		...partial,
	};
}

describe("atwaterKcalFromMacros", () => {
	it("computes 4-4-9 from macros", () => {
		expect(atwaterKcalFromMacros({ proteinG: 25, fatG: 20, carbG: 30 })).toBe(
			400,
		);
	});

	it("treats null macros as zero", () => {
		expect(
			atwaterKcalFromMacros({ proteinG: null, fatG: 1, carbG: null }),
		).toBe(9);
	});
});

describe("isUsdaNutrientProfileUsable", () => {
	it("rejects null energy", () => {
		expect(
			isUsdaNutrientProfileUsable(
				nutrients({ energyKcal: null, proteinG: 20, fatG: 10, carbG: 0 }),
			),
		).toBe(false);
	});

	it("rejects 0 energy when macros imply ≥5 kcal", () => {
		expect(
			isUsdaNutrientProfileUsable(
				nutrients({ energyKcal: 0, proteinG: 20, fatG: 5, carbG: 0 }),
			),
		).toBe(false);
	});

	it("rejects 0 energy with empty core macros", () => {
		expect(
			isUsdaNutrientProfileUsable(
				nutrients({ energyKcal: 0, proteinG: 0, fatG: 0, carbG: 0 }),
			),
		).toBe(false);
		expect(
			isUsdaNutrientProfileUsable(
				nutrients({
					energyKcal: 0,
					proteinG: null,
					fatG: null,
					carbG: null,
				}),
			),
		).toBe(false);
	});

	it("accepts a normal chicken-like profile", () => {
		expect(
			isUsdaNutrientProfileUsable(
				nutrients({
					energyKcal: 165,
					proteinG: 31,
					fatG: 3.6,
					carbG: 0,
				}),
			),
		).toBe(true);
	});

	it("rejects water-like all-zero (intentional AI fallthrough)", () => {
		expect(
			isUsdaNutrientProfileUsable(
				nutrients({ energyKcal: 0, proteinG: 0, fatG: 0, carbG: 0 }),
			),
		).toBe(false);
	});

	it("accepts 0 energy with tiny macros under the Atwater noise floor", () => {
		// 0.5g protein → 2 kcal implied (< 5 threshold)
		expect(
			isUsdaNutrientProfileUsable(
				nutrients({ energyKcal: 0, proteinG: 0.5, fatG: 0, carbG: 0 }),
			),
		).toBe(true);
	});
});
