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

	it("skips cook when confirmInsufficient is true", async () => {
		const { cookMealWithConfirmation } = await import(
			"../cook-confirmation.server"
		);
		const result = await cookMealWithConfirmation(env, orgId, mealId, {
			servings: 4,
			confirmInsufficient: true,
		});

		expect(result.cooked).toBe(true);
		expect(result.deductions).toEqual([]);
		expect(result.ingredientsDeducted).toBe(0);
		expect(result.servings).toBe(4);
		expect(cookMeal).not.toHaveBeenCalled();
		expect(getMealMissingIngredients).not.toHaveBeenCalled();
	});

	it("calls cookMeal when sufficient", async () => {
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			cooked: true,
			ingredientsDeducted: 2,
			servings: 2,
			deductions: [{ cargoId: "c1", quantity: 1 }],
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
		});
	});
});
