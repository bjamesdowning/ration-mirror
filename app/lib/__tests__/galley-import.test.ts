import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	resolveTagIds,
	createMeal,
	updateMeal,
	createProvision,
	updateProvision,
	checkCapacity,
} = vi.hoisted(() => ({
	resolveTagIds: vi.fn(),
	createMeal: vi.fn(),
	updateMeal: vi.fn(),
	createProvision: vi.fn(),
	updateProvision: vi.fn(),
	checkCapacity: vi.fn(),
}));

vi.mock("../tags.server", () => ({
	resolveTagIds,
	tagsToSlugs: (tags: { slug: string }[]) => tags.map((t) => t.slug),
}));

vi.mock("../meals.server", () => ({
	createMeal,
	updateMeal,
	createProvision,
	updateProvision,
	getMeals: vi.fn(),
}));

vi.mock("../capacity.server", () => ({
	checkCapacity,
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn().mockResolvedValue([]),
			})),
		})),
	})),
}));

import { applyGalleyImport } from "../galley.server";

describe("applyGalleyImport", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resolveTagIds.mockResolvedValue(["tag-1", "tag-2"]);
		createMeal.mockResolvedValue(null);
		updateMeal.mockResolvedValue(null);
		createProvision.mockResolvedValue(null);
		updateProvision.mockResolvedValue(null);
		checkCapacity.mockResolvedValue({ allowed: true });
	});

	it("resolves all manifest tags once before importing meals", async () => {
		await applyGalleyImport(
			{} as D1Database,
			"org-1",
			{
				version: 1,
				exportedAt: new Date().toISOString(),
				meals: [
					{
						id: undefined,
						name: "Pasta",
						type: "recipe" as const,
						domain: "food" as const,
						directions: undefined,
						servings: 2,
						equipment: [],
						ingredients: [
							{
								ingredientName: "noodles",
								quantity: 1,
								unit: "lb",
								isOptional: false,
								orderIndex: 0,
							},
						],
						tags: ["weeknight"],
					},
					{
						id: undefined,
						name: "Rice",
						type: "recipe" as const,
						domain: "food" as const,
						directions: undefined,
						servings: 2,
						equipment: [],
						ingredients: [
							{
								ingredientName: "rice",
								quantity: 1,
								unit: "cup",
								isOptional: false,
								orderIndex: 0,
							},
						],
						tags: ["freezer", "weeknight"],
					},
				],
			},
			{ DB: {} } as Env,
		);

		expect(resolveTagIds).toHaveBeenCalledTimes(1);
		expect(resolveTagIds).toHaveBeenCalledWith({}, "org-1", [
			"weeknight",
			"freezer",
		]);
		expect(createMeal).toHaveBeenCalledTimes(2);
		expect(createMeal.mock.calls[0][4]).toEqual(
			expect.objectContaining({ skipReturnRead: true }),
		);
	});

	it("records per-meal errors without aborting the import", async () => {
		createMeal
			.mockResolvedValueOnce(null)
			.mockRejectedValueOnce(new Error("bad meal"));

		const result = await applyGalleyImport(
			{} as D1Database,
			"org-1",
			{
				version: 1,
				exportedAt: new Date().toISOString(),
				meals: [
					{
						id: undefined,
						name: "Good",
						type: "recipe" as const,
						domain: "food" as const,
						directions: undefined,
						servings: 1,
						equipment: [],
						ingredients: [],
						tags: [],
					},
					{
						id: undefined,
						name: "Bad",
						type: "recipe" as const,
						domain: "food" as const,
						directions: undefined,
						servings: 1,
						equipment: [],
						ingredients: [],
						tags: [],
					},
				],
			},
			{ DB: {} } as Env,
		);

		expect(result.imported).toBe(1);
		expect(result.errors).toEqual([{ name: "Bad", error: "bad meal" }]);
	});
});
