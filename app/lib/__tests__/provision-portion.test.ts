import { describe, expect, it } from "vitest";
import {
	clampIntakeServings,
	cookServingsForCargoAmount,
	isStockShapedProvision,
	resolveProvisionUnitPortion,
	resolveProvisionUnitPortionFromRaw,
} from "~/lib/provision-portion";

describe("resolveProvisionUnitPortion", () => {
	it("uses 1 for count units", () => {
		expect(resolveProvisionUnitPortion("unit")).toBe(1);
		expect(resolveProvisionUnitPortion("piece")).toBe(1);
		expect(resolveProvisionUnitPortion("can")).toBe(1);
	});

	it("uses household mass/volume defaults", () => {
		expect(resolveProvisionUnitPortion("g")).toBe(100);
		expect(resolveProvisionUnitPortion("kg")).toBe(0.1);
		expect(resolveProvisionUnitPortion("oz")).toBe(4);
		expect(resolveProvisionUnitPortion("ml")).toBe(100);
	});

	it("normalizes raw unit aliases", () => {
		expect(resolveProvisionUnitPortionFromRaw("grams")).toEqual({
			quantity: 100,
			unit: "g",
		});
	});
});

describe("isStockShapedProvision", () => {
	it("detects full-stock promote (12 units in pantry as one serving)", () => {
		expect(
			isStockShapedProvision({
				mealServings: 1,
				ingredientQuantity: 12,
				ingredientUnit: "unit",
				cargoQuantity: 12,
				cargoUnit: "unit",
			}),
		).toBe(true);
	});

	it("detects emptied cargo after stock-dump promote", () => {
		expect(
			isStockShapedProvision({
				mealServings: 1,
				ingredientQuantity: 12,
				ingredientUnit: "unit",
				cargoQuantity: 0,
				cargoUnit: "unit",
			}),
		).toBe(true);
	});

	it("does not flag a correct unit-portion provision", () => {
		expect(
			isStockShapedProvision({
				mealServings: 1,
				ingredientQuantity: 1,
				ingredientUnit: "unit",
				cargoQuantity: 12,
				cargoUnit: "unit",
			}),
		).toBe(false);
	});

	it("does not flag a user-edited 2-unit snack portion", () => {
		expect(
			isStockShapedProvision({
				mealServings: 1,
				ingredientQuantity: 2,
				ingredientUnit: "unit",
				cargoQuantity: 12,
				cargoUnit: "unit",
			}),
		).toBe(false);
	});

	it("does not flag when mealServings is not 1", () => {
		expect(
			isStockShapedProvision({
				mealServings: 4,
				ingredientQuantity: 12,
				ingredientUnit: "unit",
				cargoQuantity: 12,
				cargoUnit: "unit",
			}),
		).toBe(false);
	});
});

describe("cookServingsForCargoAmount", () => {
	it("maps 1 of 1-unit portion to 1 serving", () => {
		expect(
			cookServingsForCargoAmount({
				requestedQuantity: 1,
				requestedUnit: "unit",
				ingredientQuantity: 1,
				ingredientUnit: "unit",
			}),
		).toBe(1);
	});

	it("maps 200g against 100g portion to 2 servings", () => {
		expect(
			cookServingsForCargoAmount({
				requestedQuantity: 200,
				requestedUnit: "g",
				ingredientQuantity: 100,
				ingredientUnit: "g",
			}),
		).toBe(2);
	});

	it("returns null on unit family mismatch", () => {
		expect(
			cookServingsForCargoAmount({
				requestedQuantity: 1,
				requestedUnit: "unit",
				ingredientQuantity: 100,
				ingredientUnit: "g",
			}),
		).toBeNull();
	});
});

describe("clampIntakeServings", () => {
	it("clamps below 0.5 and above 100", () => {
		expect(clampIntakeServings(0.1)).toEqual({ servings: 0.5, clamped: true });
		expect(clampIntakeServings(150)).toEqual({ servings: 100, clamped: true });
		expect(clampIntakeServings(2)).toEqual({ servings: 2, clamped: false });
	});
});

describe("mealNutritionHasEnergy", () => {
	it("detects usable perServing energy", async () => {
		const { mealNutritionHasEnergy } = await import("~/lib/meals.server");
		expect(mealNutritionHasEnergy(null)).toBe(false);
		expect(mealNutritionHasEnergy({ perServing: {} })).toBe(false);
		expect(mealNutritionHasEnergy({ perServing: { energyKcal: 120 } })).toBe(
			true,
		);
	});
});
