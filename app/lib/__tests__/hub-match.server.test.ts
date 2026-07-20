import { describe, expect, it, vi } from "vitest";

const matchMeals = vi.fn();

vi.mock("~/lib/matching.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../matching.server")>();
	return {
		...actual,
		matchMeals: (...args: unknown[]) => matchMeals(...args),
	};
});

describe("getHubMealMatchWidgets", () => {
	it("scores once then slices recipe/provision widgets", async () => {
		matchMeals.mockResolvedValue([
			{
				meal: { id: "m1", type: "recipe", tags: ["dinner"], name: "A" },
				matchPercentage: 100,
			},
			{
				meal: { id: "m2", type: "recipe", tags: ["lunch"], name: "B" },
				matchPercentage: 80,
			},
			{
				meal: { id: "s1", type: "provision", tags: [], name: "Snack" },
				matchPercentage: 100,
			},
		]);

		const { getHubMealMatchWidgets } = await import("../hub-match.server");
		const { MEAL_MATCH_CANDIDATE_CAP } = await import("../matching.server");

		const result = await getHubMealMatchWidgets({} as Env, "org_1", {
			mealsReady: { limit: 1, tags: ["dinner"] },
			mealsPartial: { limit: 6 },
			snacksReady: { limit: 2 },
		});

		expect(matchMeals).toHaveBeenCalledTimes(1);
		expect(matchMeals).toHaveBeenCalledWith(
			{},
			"org_1",
			expect.objectContaining({
				limit: MEAL_MATCH_CANDIDATE_CAP,
				preLimit: MEAL_MATCH_CANDIDATE_CAP,
				domain: "food",
			}),
		);
		expect(result.mealMatches).toHaveLength(1);
		expect(result.mealMatches[0]?.meal.id).toBe("m1");
		expect(result.partialMealMatches.map((r) => r.meal.id)).toEqual([
			"m1",
			"m2",
		]);
		expect(result.snackMatches).toHaveLength(1);
		expect(result.snackMatches[0]?.meal.id).toBe("s1");
	});
});
