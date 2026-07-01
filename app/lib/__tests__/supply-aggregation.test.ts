import { describe, expect, it } from "vitest";
import { aggregateIngredients } from "../supply.server";

function ingredientRow(
	overrides: Partial<{
		mealId: string;
		ingredientName: string;
		quantity: number;
		unit: string;
		domain: string;
	}> = {},
) {
	return {
		meal_ingredient: {
			mealId: overrides.mealId ?? "meal-1",
			ingredientName: overrides.ingredientName ?? "butter",
			quantity: overrides.quantity ?? 1,
			unit: overrides.unit ?? "g",
		},
		meal_domain: overrides.domain ?? "food",
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

	it("keeps separate lines for different domains", () => {
		const rows = [
			ingredientRow({ domain: "food", quantity: 1, unit: "unit" }),
			ingredientRow({ domain: "household", quantity: 1, unit: "unit" }),
		];
		const result = aggregateIngredients(rows, "metric");
		expect(result).toHaveLength(2);
	});
});
