import { describe, expect, it } from "vitest";
import {
	contributionKey,
	mergeContributionsByKey,
	type SupplyContribution,
} from "../supply.server";

function mealContribution(
	overrides: Partial<SupplyContribution> = {},
): SupplyContribution {
	return {
		name: "butter",
		normalizedName: "butter",
		baseQuantity: 100,
		baseUnit: "g",
		domain: "food",
		sourceOrigins: ["galley"],
		sourceMealIds: ["meal-1"],
		sourceCargoId: null,
		...overrides,
	};
}

function cargoContribution(
	overrides: Partial<SupplyContribution> = {},
): SupplyContribution {
	return {
		name: "Butter",
		normalizedName: "butter",
		baseQuantity: 1,
		baseUnit: "unit",
		domain: "food",
		sourceOrigins: ["cargo"],
		sourceMealIds: [],
		sourceCargoId: "cargo-1",
		...overrides,
	};
}

describe("contributionKey", () => {
	it("combines normalized name and domain", () => {
		expect(contributionKey("butter", "food")).toBe("butter__food");
	});
});

describe("mergeContributionsByKey", () => {
	it("merges galley and cargo contributions for the same item", () => {
		const merged = mergeContributionsByKey([
			mealContribution({ baseQuantity: 100, baseUnit: "g" }),
			cargoContribution({ baseQuantity: 50, baseUnit: "g" }),
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.sourceOrigins).toEqual(
			expect.arrayContaining(["galley", "cargo"]),
		);
		expect(merged[0]?.sourceMealIds).toEqual(["meal-1"]);
		expect(merged[0]?.sourceCargoId).toBeNull();
		expect(merged[0]?.baseQuantity).toBe(150);
	});

	it("keeps sourceCargoId when only cargo contributes", () => {
		const merged = mergeContributionsByKey([cargoContribution()]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.sourceOrigins).toEqual(["cargo"]);
		expect(merged[0]?.sourceCargoId).toBe("cargo-1");
	});

	it("merges synonyms via shared normalizedName key", () => {
		const merged = mergeContributionsByKey([
			cargoContribution({
				name: "Paper Towels",
				normalizedName: "paper towel",
				domain: "household",
			}),
			cargoContribution({
				name: "paper towels",
				normalizedName: "paper towel",
				domain: "household",
				baseQuantity: 2,
				sourceCargoId: "cargo-2",
			}),
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.baseQuantity).toBe(3);
	});

	it("keeps separate lines for different domains", () => {
		const merged = mergeContributionsByKey([
			mealContribution({ domain: "food" }),
			mealContribution({
				name: "bleach",
				normalizedName: "bleach",
				domain: "household",
				sourceOrigins: ["cargo"],
			}),
		]);
		expect(merged).toHaveLength(2);
	});

	it("returns empty array for no contributions", () => {
		expect(mergeContributionsByKey([])).toEqual([]);
	});
});
