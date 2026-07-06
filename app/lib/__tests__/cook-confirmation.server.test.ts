import { beforeEach, describe, expect, it, vi } from "vitest";

const cookMeal = vi.fn();
const getMealMissingIngredients = vi.fn();

vi.mock("../meals.server", () => ({
	cookMeal: (...args: unknown[]) => cookMeal(...args),
}));

vi.mock("../matching.server", () => ({
	getMealMissingIngredients: (...args: unknown[]) =>
		getMealMissingIngredients(...args),
}));

const env = { DB: {} } as Env;
const orgId = "org-1";
const mealId = "meal-1";

describe("cookMealWithConfirmation", () => {
	beforeEach(() => {
		cookMeal.mockReset();
		getMealMissingIngredients.mockReset();
		vi.resetModules();
	});

	it("returns requiresConfirmation when ingredients are missing", async () => {
		getMealMissingIngredients.mockResolvedValue([
			{ name: "chicken", required: 2, available: 0, unit: "lb" },
		]);

		const { cookMealWithConfirmation } = await import(
			"../cook-confirmation.server"
		);
		const result = await cookMealWithConfirmation(env, orgId, mealId, {
			servings: 2,
		});

		expect(result.requiresConfirmation).toBe(true);
		expect(result.missingIngredients).toHaveLength(1);
		expect(result.cooked).toBe(false);
		expect(cookMeal).not.toHaveBeenCalled();
	});

	it("calls cookMeal with partial deduction when confirmInsufficient is true", async () => {
		cookMeal.mockResolvedValue({
			cooked: true,
			ingredientsDeducted: 1,
			servings: 4,
			deductions: [{ cargoId: "c1", quantity: 100 }],
			partialCook: true,
			skippedIngredients: [
				{ name: "eggs", required: 4, available: 0, unit: "count" },
			],
		});

		const { cookMealWithConfirmation } = await import(
			"../cook-confirmation.server"
		);
		const result = await cookMealWithConfirmation(env, orgId, mealId, {
			servings: 4,
			confirmInsufficient: true,
		});

		expect(result.cooked).toBe(true);
		expect(result.deductions).toHaveLength(1);
		expect(result.partialCook).toBe(true);
		expect(result.skippedIngredients).toHaveLength(1);
		expect(cookMeal).toHaveBeenCalledWith(env, orgId, mealId, {
			servings: 4,
			deductionMode: "partial",
		});
		expect(getMealMissingIngredients).not.toHaveBeenCalled();
	});

	it("calls cookMeal when sufficient", async () => {
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			cooked: true,
			ingredientsDeducted: 2,
			servings: 2,
			deductions: [{ cargoId: "c1", quantity: 1 }],
			partialCook: false,
		});

		const { cookMealWithConfirmation } = await import(
			"../cook-confirmation.server"
		);
		const result = await cookMealWithConfirmation(env, orgId, mealId, {
			servings: 2,
		});

		expect(result.cooked).toBe(true);
		expect(result.deductions).toHaveLength(1);
		expect(cookMeal).toHaveBeenCalledWith(env, orgId, mealId, {
			servings: 2,
			deductionMode: "strict",
		});
	});
});
