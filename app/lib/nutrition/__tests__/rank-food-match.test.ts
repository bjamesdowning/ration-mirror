import { describe, expect, it } from "vitest";
import {
	fdcPrimaryLabel,
	pickBestFoodMatch,
	scoreFoodMatch,
} from "../rank-food-match";

describe("fdcPrimaryLabel", () => {
	it("takes text before the first comma", () => {
		expect(fdcPrimaryLabel("Milk, whole, 3.25% milkfat")).toBe("milk");
		expect(fdcPrimaryLabel("Candies, milk chocolate")).toBe("candies");
	});
});

describe("scoreFoodMatch", () => {
	it("scores dairy milk primary label high", () => {
		const dairy = scoreFoodMatch(
			"milk",
			"Milk, whole, 3.25% milkfat, with added vitamin D",
		);
		const granola = scoreFoodMatch(
			"milk",
			"Snacks, granola bars, soft, coated, milk chocolate coating, chocolate chip",
		);
		expect(dairy).toBeGreaterThan(450);
		expect(granola).toBe(Number.NEGATIVE_INFINITY);
	});

	it("rejects candies / crackers that embed milk", () => {
		expect(scoreFoodMatch("milk", "Candies, milk chocolate")).toBe(
			Number.NEGATIVE_INFINITY,
		);
		expect(scoreFoodMatch("milk", "Crackers, milk")).toBe(
			Number.NEGATIVE_INFINITY,
		);
	});

	it("prefers olive oil primary over unrelated oils when query is olive oil", () => {
		const olive = scoreFoodMatch("olive oil", "Oil, olive, salad or cooking");
		const veg = scoreFoodMatch("olive oil", "Oil, vegetable, soybean");
		expect(olive).toBeGreaterThan(veg);
	});
});

describe("pickBestFoodMatch", () => {
	it("picks dairy milk over granola milk chocolate", () => {
		const best = pickBestFoodMatch("milk", [
			{
				fdcId: 1,
				description:
					"Snacks, granola bars, soft, coated, milk chocolate coating, chocolate chip",
			},
			{
				fdcId: 2,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
			},
			{ fdcId: 3, description: "Candies, milk chocolate" },
		]);
		expect(best?.fdcId).toBe(2);
		expect(best?.highConfidence).toBe(true);
	});

	it("does not confuse peanut butter with butter", () => {
		const best = pickBestFoodMatch("butter", [
			{ fdcId: 1, description: "Peanut butter, smooth style" },
			{ fdcId: 2, description: "Butter, salted" },
		]);
		expect(best?.fdcId).toBe(2);
	});

	it("prefers chicken breast over unrelated chicken dishes when scored", () => {
		const best = pickBestFoodMatch("chicken breast", [
			{
				fdcId: 1,
				description: "Chicken, broilers or fryers, breast, meat only, raw",
			},
			{ fdcId: 2, description: "Soup, chicken noodle, canned, condensed" },
		]);
		expect(best?.fdcId).toBe(1);
	});

	it("returns null when all candidates are rejected", () => {
		const best = pickBestFoodMatch("milk", [
			{ fdcId: 1, description: "Candies, milk chocolate" },
			{
				fdcId: 2,
				description:
					"Snacks, granola bars, soft, coated, milk chocolate coating",
			},
		]);
		expect(best).toBeNull();
	});
});
