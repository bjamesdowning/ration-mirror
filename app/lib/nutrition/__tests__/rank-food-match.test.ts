import { describe, expect, it } from "vitest";
import {
	fdcPrimaryLabel,
	foodMatchPeerKey,
	fragileHeadForPrimaryPrefix,
	mergeFoodMatchCandidates,
	pickBestFoodMatch,
	primaryPrefixLikePatterns,
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

	it("auto-accepts OCR whole milk against inverted USDA label", () => {
		const best = pickBestFoodMatch("whole milk", [
			{
				fdcId: 1,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
				dataType: "foundation_food",
			},
			{
				fdcId: 2,
				description:
					"Milk, lowfat, 1% milkfat, with added vitamin A and vitamin D",
			},
			{
				fdcId: 3,
				description: "Beverages, almond milk, unsweetened, shelf stable",
			},
		]);
		expect(best?.fdcId).toBe(1);
		expect(best?.autoAccept).toBe(true);
		expect(best?.normalizedScore).toBeGreaterThanOrEqual(0.92);
	});

	it("peer-dedupes Foundation vs SR whole milk for bare milk margin", () => {
		const best = pickBestFoodMatch("milk", [
			{
				fdcId: 1,
				description: "Milk, whole, 3.25% milkfat",
				dataType: "foundation_food",
			},
			{
				fdcId: 2,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
			},
			{ fdcId: 3, description: "Milk, lowfat, 1% milkfat" },
		]);
		expect(best?.fdcId).toBe(1);
		expect(best?.autoAccept).toBe(true);
	});

	it("dedupes repeated peer modifier tokens in the peer key", () => {
		expect(foodMatchPeerKey("Milk, whole, whole milkfat")).toBe(
			foodMatchPeerKey("Milk, whole, 3.25% milkfat"),
		);
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
		expect(best?.autoAccept).toBe(true);
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

	it("rejects Milk imitation for bare milk", () => {
		expect(
			scoreFoodMatch("milk", "Milk, imitation, fluid with hydrogenated oil"),
		).toBe(Number.NEGATIVE_INFINITY);
		const best = pickBestFoodMatch("milk", [
			{
				fdcId: 1,
				description: "Milk, imitation, fluid with hydrogenated vegetable oils",
			},
			{
				fdcId: 2,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
				dataType: "foundation_food",
			},
		]);
		expect(best?.fdcId).toBe(2);
	});

	it("prefers Milk whole over prepared foods mentioning whole milk", () => {
		const best = pickBestFoodMatch("whole milk", [
			{
				fdcId: 168554,
				description:
					"Potatoes, mashed, prepared from granules, without milk, whole milk and margarine",
			},
			{
				fdcId: 168785,
				description:
					"Puddings, vanilla, dry mix, instant, prepared with whole milk",
			},
			{
				fdcId: 171270,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
				dataType: "foundation_food",
			},
		]);
		expect(best?.fdcId).toBe(171270);
		expect(best?.autoAccept).toBe(true);
	});
});

describe("fragileHeadForPrimaryPrefix", () => {
	it("finds milk in whole milk", () => {
		expect(fragileHeadForPrimaryPrefix("whole milk")).toBe("milk");
		expect(fragileHeadForPrimaryPrefix("milk")).toBe("milk");
		expect(fragileHeadForPrimaryPrefix("olive oil")).toBeNull();
	});

	it("builds USDA primary LIKE patterns", () => {
		expect(primaryPrefixLikePatterns("milk")).toEqual(["Milk,%"]);
		expect(primaryPrefixLikePatterns("yogurt")).toEqual([
			"Yogurt,%",
			"Yoghurt,%",
		]);
	});

	it("merges candidate banks by fdcId", () => {
		const merged = mergeFoodMatchCandidates(
			[{ fdcId: 1, description: "A" }],
			[
				{ fdcId: 1, description: "A-dup" },
				{ fdcId: 2, description: "B" },
			],
		);
		expect(merged).toHaveLength(2);
		expect(merged.find((c) => c.fdcId === 1)?.description).toBe("A");
	});
});
