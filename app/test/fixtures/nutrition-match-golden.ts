/**
 * Golden matcher cases for nutrition food-name ranking regression tests.
 * Covers fragile-head abstentions, OCR-style names, and dairy vs candy disambiguation.
 */
import type { FoodMatchCandidate } from "~/lib/nutrition/rank-food-match";

export type NutritionMatchGoldenCase = {
	id: string;
	query: string;
	candidates: FoodMatchCandidate[];
	expectedFdcId: number | null;
	note?: string;
};

export const NUTRITION_MATCH_GOLDEN_CASES: NutritionMatchGoldenCase[] = [
	{
		id: "milk-dairy-vs-chocolate",
		query: "milk",
		note: "Must abstain from milk chocolate / granola coatings",
		candidates: [
			{
				fdcId: 9001,
				description:
					"Snacks, granola bars, soft, coated, milk chocolate coating, chocolate chip",
			},
			{
				fdcId: 1097510,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
			},
			{ fdcId: 9003, description: "Candies, milk chocolate" },
		],
		expectedFdcId: 1097510,
	},
	{
		id: "milk-chocolate-abstain",
		query: "milk",
		note: "All candidates are abstained — return null",
		candidates: [
			{ fdcId: 9003, description: "Candies, milk chocolate" },
			{
				fdcId: 9004,
				description:
					"Snacks, granola bars, soft, coated, milk chocolate coating",
			},
			{ fdcId: 9005, description: "Crackers, milk" },
		],
		expectedFdcId: null,
	},
	{
		id: "butter-vs-peanut-butter",
		query: "butter",
		candidates: [
			{ fdcId: 8001, description: "Peanut butter, smooth style" },
			{ fdcId: 8002, description: "Butter, salted" },
		],
		expectedFdcId: 8002,
	},
	{
		id: "ocr-organic-whole-milk-abstain",
		query: "organic whole milk",
		note: "OCR multi-token line abstains below threshold — safe fail-closed",
		candidates: [
			{
				fdcId: 1097510,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
			},
			{
				fdcId: 9001,
				description: "Beverages, almond milk, unsweetened, shelf stable",
			},
		],
		expectedFdcId: null,
	},
	{
		id: "olive-oil-primary",
		query: "olive oil",
		candidates: [
			{ fdcId: 7001, description: "Oil, olive, salad or cooking" },
			{ fdcId: 7002, description: "Oil, vegetable, soybean" },
		],
		expectedFdcId: 7001,
	},
];
