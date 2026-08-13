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
	it("clamps below 0.01 and above 100", () => {
		expect(clampIntakeServings(0.001)).toEqual({
			servings: 0.01,
			clamped: true,
		});
		expect(clampIntakeServings(0.1)).toEqual({
			servings: 0.1,
			clamped: false,
		});
		expect(clampIntakeServings(150)).toEqual({ servings: 100, clamped: true });
		expect(clampIntakeServings(2)).toEqual({ servings: 2, clamped: false });
	});
});

describe("mealNutritionIsUsable", () => {
	it("requires a resolved aggregate instead of accepting zero-filled energy", async () => {
		const { mealNutritionIsUsable } = await import("~/lib/meals.server");
		expect(mealNutritionIsUsable(null)).toBe(false);
		expect(
			mealNutritionIsUsable({
				perServing: { energyKcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
				coverage: 0,
				attributions: [],
			}),
		).toBe(false);
	});

	it("accepts a resolved zero-calorie food", async () => {
		const { mealNutritionIsUsable } = await import("~/lib/meals.server");
		expect(
			mealNutritionIsUsable({
				perServing: { energyKcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
				coverage: 1,
				attributions: [{ ingredientName: "sparkling water" }],
			}),
		).toBe(true);
	});

	it("accepts a covered provision with complete macros (persisted carbG)", async () => {
		const { mealNutritionIsUsable } = await import("~/lib/meals.server");
		expect(
			mealNutritionIsUsable({
				perServing: { energyKcal: 120, proteinG: 20, carbG: 0, fatG: 4 },
				coverage: 1,
				attributions: [{ ingredientName: "steak" }],
			}),
		).toBe(true);
	});

	it("accepts wire-alias carbsG when carbG is absent", async () => {
		const { mealNutritionIsUsable } = await import("~/lib/meals.server");
		expect(
			mealNutritionIsUsable({
				perServing: { energyKcal: 90, proteinG: 10, carbsG: 5, fatG: 2 },
				coverage: 1,
				attributions: [{ ingredientName: "yogurt" }],
			}),
		).toBe(true);
	});
});
