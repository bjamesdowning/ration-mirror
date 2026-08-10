import { describe, expect, it } from "vitest";
import { NUTRITION_MATCH_GOLDEN_CASES } from "~/test/fixtures/nutrition-match-golden";
import { pickBestFoodMatch } from "../rank-food-match";

describe("NUTRITION_MATCH_GOLDEN_CASES", () => {
	it("covers at least 300 cases with ≥100 abstentions", () => {
		expect(NUTRITION_MATCH_GOLDEN_CASES.length).toBeGreaterThanOrEqual(300);
		const abstentions = NUTRITION_MATCH_GOLDEN_CASES.filter(
			(c) => c.expectedFdcId == null,
		);
		expect(abstentions.length).toBeGreaterThanOrEqual(100);
	});

	for (const testCase of NUTRITION_MATCH_GOLDEN_CASES) {
		it(`${testCase.id}: ${testCase.note ?? testCase.query}`, () => {
			const best = pickBestFoodMatch(testCase.query, testCase.candidates);
			if (testCase.expectedFdcId == null) {
				expect(best).toBeNull();
				return;
			}
			expect(best?.fdcId).toBe(testCase.expectedFdcId);
			expect(best?.quality).not.toBe("verified");
			if (testCase.expectAutoAccept === true) {
				expect(best?.autoAccept).toBe(true);
			} else if (testCase.expectAutoAccept === false) {
				expect(best?.autoAccept).toBe(false);
			}
		});
	}
});
