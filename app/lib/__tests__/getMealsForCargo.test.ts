import { beforeEach, describe, expect, it, vi } from "vitest";

const batchMock = vi.fn();
const chunkedQueryMock = vi.fn();

vi.mock("drizzle-orm/d1", () => {
	const queryBuilder = {
		from: vi.fn().mockReturnThis(),
		innerJoin: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		offset: vi.fn().mockReturnThis(),
	};

	return {
		drizzle: vi.fn(() => ({
			select: vi.fn(() => queryBuilder),
			batch: batchMock,
		})),
	};
});

vi.mock("../query-utils.server", () => ({
	chunkedQuery: chunkedQueryMock,
	D1_MAX_BOUND_PARAMS: 100,
	D1_MAX_INGREDIENT_ROWS_PER_STATEMENT: 12,
	D1_MAX_TAG_ROWS_PER_STATEMENT: 33,
}));

describe("getMealsForCargo", () => {
	beforeEach(() => {
		batchMock.mockReset();
		chunkedQueryMock.mockReset();
	});

	it("returns meals matched by direct cargoId and ingredient name", async () => {
		const { getMealsForCargo } = await import("~/lib/meals.server");

		batchMock.mockResolvedValue([
			[
				{
					id: "ing-1",
					mealId: "meal-1",
					cargoId: "cargo-1",
					ingredientName: "milk",
					quantity: 1,
					unit: "l",
					isOptional: false,
					orderIndex: 0,
				},
			],
			[
				{
					id: "ing-2",
					mealId: "meal-2",
					cargoId: null,
					ingredientName: "milk",
					quantity: 250,
					unit: "ml",
					isOptional: false,
					orderIndex: 1,
				},
			],
		]);

		chunkedQueryMock
			.mockResolvedValueOnce([
				{
					id: "meal-1",
					name: "Overnight Oats",
					description: "Quick breakfast",
					createdAt: new Date("2026-01-01T00:00:00Z"),
				},
				{
					id: "meal-2",
					name: "White Sauce",
					description: "Pan sauce",
					createdAt: new Date("2026-01-02T00:00:00Z"),
				},
			])
			.mockResolvedValueOnce([
				{ mealId: "meal-1", tag: "breakfast" },
				{ mealId: "meal-2", tag: "sauce" },
			]);

		const result = await getMealsForCargo(
			{} as D1Database,
			"org-1",
			"cargo-1",
			"milk",
		);

		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("meal-2");
		expect(result[1].id).toBe("meal-1");
		expect(result[0].connectedIngredients[0].connectionType).toBe("name_match");
		expect(result[1].connectedIngredients[0].connectionType).toBe("direct");
	});

	it("deduplicates meal rows when direct and name matches hit same meal", async () => {
		const { getMealsForCargo } = await import("~/lib/meals.server");

		batchMock.mockResolvedValue([
			[
				{
					id: "ing-1",
					mealId: "meal-1",
					cargoId: "cargo-1",
					ingredientName: "milk",
					quantity: 1,
					unit: "l",
					isOptional: false,
					orderIndex: 0,
				},
			],
			[
				{
					id: "ing-2",
					mealId: "meal-1",
					cargoId: null,
					ingredientName: "milk",
					quantity: 100,
					unit: "ml",
					isOptional: true,
					orderIndex: 1,
				},
			],
		]);

		chunkedQueryMock
			.mockResolvedValueOnce([
				{
					id: "meal-1",
					name: "Cream Soup",
					description: null,
					createdAt: new Date("2026-01-02T00:00:00Z"),
				},
			])
			.mockResolvedValueOnce([{ mealId: "meal-1", tag: "soup" }]);

		const result = await getMealsForCargo(
			{} as D1Database,
			"org-1",
			"cargo-1",
			"milk",
		);

		expect(result).toHaveLength(1);
		expect(result[0].connectedIngredients).toHaveLength(2);
		expect(
			result[0].connectedIngredients.map((ing) => ing.connectionType),
		).toEqual(["direct", "name_match"]);
	});

	it("returns an empty array when no matches exist", async () => {
		const { getMealsForCargo } = await import("~/lib/meals.server");

		batchMock.mockResolvedValue([[], []]);

		const result = await getMealsForCargo(
			{} as D1Database,
			"org-1",
			"cargo-1",
			"milk",
		);

		expect(result).toEqual([]);
		expect(chunkedQueryMock).not.toHaveBeenCalled();
	});
});
