import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

const batchMock = vi.fn();
const chunkedQueryMock = vi.fn();
const getTagsForMealIdsMock = vi.fn();
const resolveIngredientCargoLinksMock = vi.fn();

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
	D1_MAX_TAG_ROWS_PER_STATEMENT: 50,
}));

vi.mock("../tags.server", () => ({
	getTagsForMealIds: (...args: unknown[]) => getTagsForMealIdsMock(...args),
	getOrganizationTagSlugs: vi.fn(async () => []),
}));

vi.mock("../ingredient-cargo-links.server", () => ({
	resolveIngredientCargoLinks: (...args: unknown[]) =>
		resolveIngredientCargoLinksMock(...args),
	connectionTypeFromMatch: (matchType: string) =>
		matchType === "none" ? null : matchType,
}));

describe("getMealsForCargo", () => {
	beforeEach(() => {
		batchMock.mockReset();
		chunkedQueryMock.mockReset();
		getTagsForMealIdsMock.mockReset();
		resolveIngredientCargoLinksMock.mockReset();
	});

	it("returns meals matched by direct cargoId and resolved pantry links", async () => {
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

		resolveIngredientCargoLinksMock.mockResolvedValue(
			new Map([
				[
					"milk",
					{
						cargoIds: ["cargo-1"],
						primaryCargoId: "cargo-1",
						matchType: "exact",
					},
				],
			]),
		);

		chunkedQueryMock.mockResolvedValueOnce([
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
		]);

		getTagsForMealIdsMock.mockResolvedValue(
			new Map([
				["meal-1", [{ id: "tag-1", slug: "breakfast", name: "Breakfast" }]],
				["meal-2", [{ id: "tag-2", slug: "sauce", name: "Sauce" }]],
			]),
		);

		const result = await getMealsForCargo(createMockEnv(), "org-1", "cargo-1");

		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("meal-2");
		expect(result[1].id).toBe("meal-1");
		expect(result[0].connectedIngredients[0].connectionType).toBe("exact");
		expect(result[1].connectedIngredients[0].connectionType).toBe("direct");
		expect(result[0].tags[0].slug).toBe("sauce");
	});

	it("includes token and vector reverse matches", async () => {
		const { getMealsForCargo } = await import("~/lib/meals.server");

		batchMock.mockResolvedValue([
			[],
			[
				{
					id: "ing-bread",
					mealId: "meal-toast",
					cargoId: null,
					ingredientName: "bread",
					quantity: 2,
					unit: "slice",
					isOptional: false,
					orderIndex: 0,
				},
				{
					id: "ing-ciabatta",
					mealId: "meal-panini",
					cargoId: null,
					ingredientName: "ciabatta",
					quantity: 1,
					unit: "ea",
					isOptional: false,
					orderIndex: 0,
				},
			],
		]);

		resolveIngredientCargoLinksMock.mockResolvedValue(
			new Map([
				[
					"bread",
					{
						cargoIds: ["cargo-1"],
						primaryCargoId: "cargo-1",
						matchType: "token",
					},
				],
				[
					"ciabatta",
					{
						cargoIds: ["cargo-1"],
						primaryCargoId: "cargo-1",
						matchType: "vector",
					},
				],
			]),
		);

		chunkedQueryMock.mockResolvedValueOnce([
			{
				id: "meal-toast",
				name: "Toast",
				description: null,
				createdAt: new Date("2026-01-02T00:00:00Z"),
			},
			{
				id: "meal-panini",
				name: "Panini",
				description: null,
				createdAt: new Date("2026-01-01T00:00:00Z"),
			},
		]);
		getTagsForMealIdsMock.mockResolvedValue(new Map());

		const result = await getMealsForCargo(createMockEnv(), "org-1", "cargo-1");
		expect(result).toHaveLength(2);
		const types = result.flatMap((meal) =>
			meal.connectedIngredients.map((ing) => ing.connectionType),
		);
		expect(types).toEqual(expect.arrayContaining(["token", "vector"]));
	});

	it("deduplicates meal rows when direct and resolved matches hit same meal", async () => {
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

		resolveIngredientCargoLinksMock.mockResolvedValue(
			new Map([
				[
					"milk",
					{
						cargoIds: ["cargo-1"],
						primaryCargoId: "cargo-1",
						matchType: "exact",
					},
				],
			]),
		);

		chunkedQueryMock.mockResolvedValueOnce([
			{
				id: "meal-1",
				name: "Cream Soup",
				description: null,
				createdAt: new Date("2026-01-02T00:00:00Z"),
			},
		]);

		getTagsForMealIdsMock.mockResolvedValue(
			new Map([["meal-1", [{ id: "tag-1", slug: "soup", name: "Soup" }]]]),
		);

		const result = await getMealsForCargo(createMockEnv(), "org-1", "cargo-1");

		expect(result).toHaveLength(1);
		expect(result[0].connectedIngredients).toHaveLength(2);
		expect(
			result[0].connectedIngredients.map((ing) => ing.connectionType),
		).toEqual(["direct", "exact"]);
	});

	it("returns an empty array when no matches exist", async () => {
		const { getMealsForCargo } = await import("~/lib/meals.server");

		batchMock.mockResolvedValue([[], []]);

		const result = await getMealsForCargo(createMockEnv(), "org-1", "cargo-1");

		expect(result).toEqual([]);
		expect(chunkedQueryMock).not.toHaveBeenCalled();
		expect(getTagsForMealIdsMock).not.toHaveBeenCalled();
		expect(resolveIngredientCargoLinksMock).not.toHaveBeenCalled();
	});
});
