import { describe, expect, it } from "vitest";
import { resolveSupplyItemTags } from "../supply-tags";

describe("supply-tags", () => {
	it("prefers cargo tags when names match", () => {
		const tags = resolveSupplyItemTags({
			itemName: "Chicken Breast",
			cargoRows: [
				{
					name: "chicken breast",
					tags: [
						{
							id: "1",
							slug: "protein",
							name: "Protein",
							color: null,
							category: null,
						},
						{
							id: "2",
							slug: "poultry",
							name: "Poultry",
							color: null,
							category: null,
						},
					],
				},
			],
		});
		expect(tags).toEqual(["poultry", "protein"]);
	});

	it("falls back to meal tags when cargo has no match", () => {
		const mealTags = new Map([["meal-1", ["weeknight", "quick"]]]);
		const tags = resolveSupplyItemTags({
			itemName: "rice",
			cargoRows: [],
			mealTagsByMealId: mealTags,
			sourceMealIds: ["meal-1"],
		});
		expect(tags).toEqual(["quick", "weeknight"]);
	});
});
