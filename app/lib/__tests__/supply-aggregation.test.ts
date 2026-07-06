import { describe, expect, it } from "vitest";
import { createCargoIndexRow } from "~/test/helpers/fixtures";
import { computeBaseFields } from "../base-quantity";
import {
	buildCargoIndex,
	getAvailableQuantityWithMap,
} from "../matching.server";
import { aggregateIngredients } from "../supply.server";

function ingredientRow(
	overrides: Partial<{
		mealId: string;
		ingredientName: string;
		quantity: number;
		unit: string;
		baseQuantity: number;
		baseUnit: string;
		domain: string;
		supplyOrigin: "manifest" | "galley";
	}> = {},
) {
	const quantity = overrides.quantity ?? 1;
	const unit = overrides.unit ?? "g";
	const name = overrides.ingredientName ?? "butter";
	const base = computeBaseFields(quantity, unit, name);
	return {
		meal_ingredient: {
			mealId: overrides.mealId ?? "meal-1",
			ingredientName: name,
			quantity,
			unit,
			baseQuantity: overrides.baseQuantity ?? base.baseQuantity,
			baseUnit: overrides.baseUnit ?? base.baseUnit,
		},
		meal_domain: overrides.domain ?? "food",
		supplyOrigin: overrides.supplyOrigin ?? "galley",
	};
}

describe("aggregateIngredients", () => {
	it("merges same ingredient with same base unit", () => {
		const rows = [
			ingredientRow({ mealId: "m1", quantity: 100, unit: "g" }),
			ingredientRow({ mealId: "m2", quantity: 50, unit: "g" }),
		];
		const result = aggregateIngredients(rows, "metric");
		expect(result).toHaveLength(1);
		expect(result[0]?.quantity).toBe(150);
		expect(result[0]?.sourceMealIds).toEqual(
			expect.arrayContaining(["m1", "m2"]),
		);
	});

	it("merges same ingredient across compatible units (cup + g flour)", () => {
		const rows = [
			ingredientRow({
				mealId: "m1",
				ingredientName: "flour",
				quantity: 1,
				unit: "cup",
			}),
			ingredientRow({
				mealId: "m2",
				ingredientName: "flour",
				quantity: 120,
				unit: "g",
			}),
		];
		const result = aggregateIngredients(rows, "metric");
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("flour");
		expect(result[0]?.quantity).toBeGreaterThan(0);
		expect(result[0]?.sourceMealIds).toEqual(
			expect.arrayContaining(["m1", "m2"]),
		);
	});

	it("uses persisted base fields instead of authored units", () => {
		const result = aggregateIngredients(
			[
				ingredientRow({
					ingredientName: "flour",
					quantity: 1,
					unit: "cup",
					baseQuantity: 125,
					baseUnit: "g",
				}),
			],
			"metric",
		);
		expect(result[0]?.baseQuantity).toBe(125);
		expect(result[0]?.baseUnit).toBe("g");
	});

	it("merges sourceOrigins from manifest and galley rows", () => {
		const rows = [
			ingredientRow({ mealId: "m1", supplyOrigin: "manifest" }),
			ingredientRow({ mealId: "m2", supplyOrigin: "galley" }),
		];
		const result = aggregateIngredients(rows, "metric");
		expect(result[0]?.sourceOrigins).toEqual(
			expect.arrayContaining(["manifest", "galley"]),
		);
	});

	it("keeps separate lines for different domains", () => {
		const rows = [
			ingredientRow({ domain: "food", quantity: 1, unit: "unit" }),
			ingredientRow({ domain: "household", quantity: 1, unit: "unit" }),
		];
		const result = aggregateIngredients(rows, "metric");
		expect(result).toHaveLength(2);
	});
});

describe("supply cargo skip — expired stock excluded", () => {
	it("treats expired-only cargo as unavailable so ingredients are not skipped as in-stock", () => {
		const expired = new Date("2025-06-10T12:00:00Z");
		const orgCargo = [
			createCargoIndexRow({
				name: "salmon",
				quantity: 500,
				unit: "g",
				expiresAt: expired,
			}),
		];
		const index = buildCargoIndex(orgCargo);
		const available = getAvailableQuantityWithMap(
			"salmon",
			"g",
			index,
			new Map(),
		);
		expect(available).toBe(0);
	});
});
