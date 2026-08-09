import { describe, expect, it } from "vitest";
import { NUTRITION_MATCH_GOLDEN_CASES } from "~/test/fixtures/nutrition-match-golden";
import { pickBestFoodMatch } from "../rank-food-match";

describe("NUTRITION_MATCH_GOLDEN_CASES", () => {
	for (const testCase of NUTRITION_MATCH_GOLDEN_CASES) {
		it(`${testCase.id}: ${testCase.note ?? testCase.query}`, () => {
			const best = pickBestFoodMatch(testCase.query, testCase.candidates);
			if (testCase.expectedFdcId == null) {
				expect(best).toBeNull();
				return;
			}
			expect(best?.fdcId).toBe(testCase.expectedFdcId);
		});
	}
});
