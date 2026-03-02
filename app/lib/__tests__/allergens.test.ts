import { describe, expect, it } from "vitest";
import {
	ALLERGEN_LABELS,
	ALLERGEN_SLUGS,
	buildAllergenPromptBlock,
	detectAllergens,
	isAllergenSlug,
	mealContainsAllergen,
	parseAllergens,
} from "~/lib/allergens";

// ---------------------------------------------------------------------------
// detectAllergens
// ---------------------------------------------------------------------------

describe("detectAllergens", () => {
	it("returns empty array when allergens list is empty", () => {
		expect(detectAllergens(["peanut butter", "chicken"], [])).toEqual([]);
	});

	it("returns empty array when ingredient list is empty", () => {
		expect(detectAllergens([], ["peanuts"])).toEqual([]);
	});

	it("detects a simple allergen match", () => {
		const result = detectAllergens(["peanut butter", "flour"], ["peanuts"]);
		expect(result).toContain("peanuts");
	});

	it("is case-insensitive", () => {
		const result = detectAllergens(["PEANUT BUTTER"], ["peanuts"]);
		expect(result).toContain("peanuts");
	});

	it("detects multiple allergens in the same list", () => {
		const result = detectAllergens(
			["peanut oil", "cheddar cheese", "whole milk"],
			["peanuts", "milk"],
		);
		expect(result).toContain("peanuts");
		expect(result).toContain("milk");
	});

	it("does not return allergens that are not present", () => {
		const result = detectAllergens(
			["chicken", "rice", "olive oil"],
			["peanuts", "shellfish", "milk"],
		);
		expect(result).toEqual([]);
	});

	it("detects wheat via synonym 'flour'", () => {
		const result = detectAllergens(["all-purpose flour"], ["wheat"]);
		expect(result).toContain("wheat");
	});

	it("detects tree-nuts via partial name 'almond'", () => {
		const result = detectAllergens(["sliced almonds", "sugar"], ["tree-nuts"]);
		expect(result).toContain("tree-nuts");
	});

	it("detects sesame via 'tahini'", () => {
		const result = detectAllergens(["tahini paste", "lemon"], ["sesame"]);
		expect(result).toContain("sesame");
	});

	it("detects milk via 'butter'", () => {
		const result = detectAllergens(["unsalted butter"], ["milk"]);
		expect(result).toContain("milk");
	});

	it("detects eggs via partial match", () => {
		const result = detectAllergens(["2 large eggs", "flour"], ["eggs"]);
		expect(result).toContain("eggs");
	});

	it("only returns triggered allergens, not the full allergen list", () => {
		const result = detectAllergens(
			["tofu", "soy sauce"],
			["soybeans", "peanuts", "milk"],
		);
		expect(result).toEqual(["soybeans"]);
	});

	it("handles ingredient names with mixed case and extra spaces", () => {
		const result = detectAllergens(["  WHOLE Wheat Flour  "], ["wheat"]);
		expect(result).toContain("wheat");
	});
});

// ---------------------------------------------------------------------------
// mealContainsAllergen
// ---------------------------------------------------------------------------

describe("mealContainsAllergen", () => {
	it("returns true when at least one allergen is present", () => {
		expect(mealContainsAllergen(["peanut butter"], ["peanuts"])).toBe(true);
	});

	it("returns false when no allergens are present", () => {
		expect(mealContainsAllergen(["chicken", "rice"], ["peanuts", "milk"])).toBe(
			false,
		);
	});

	it("returns false for empty allergens list", () => {
		expect(mealContainsAllergen(["peanut butter"], [])).toBe(false);
	});

	it("returns false for empty ingredient list", () => {
		expect(mealContainsAllergen([], ["peanuts"])).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// buildAllergenPromptBlock
// ---------------------------------------------------------------------------

describe("buildAllergenPromptBlock", () => {
	it("returns empty string for empty allergens list", () => {
		expect(buildAllergenPromptBlock([])).toBe("");
	});

	it("includes allergen labels in the output", () => {
		const block = buildAllergenPromptBlock(["peanuts", "shellfish"]);
		expect(block).toContain("Peanuts");
		expect(block).toContain("Shellfish");
	});

	it("includes the dietary_restrictions XML tag", () => {
		const block = buildAllergenPromptBlock(["milk"]);
		expect(block).toContain("<dietary_restrictions>");
		expect(block).toContain("</dietary_restrictions>");
	});

	it("includes a hard constraint instruction", () => {
		const block = buildAllergenPromptBlock(["eggs"]);
		expect(block.toLowerCase()).toContain("never");
	});
});

// ---------------------------------------------------------------------------
// isAllergenSlug
// ---------------------------------------------------------------------------

describe("isAllergenSlug", () => {
	it("returns true for a valid slug", () => {
		expect(isAllergenSlug("peanuts")).toBe(true);
		expect(isAllergenSlug("tree-nuts")).toBe(true);
		expect(isAllergenSlug("sulphites")).toBe(true);
	});

	it("returns false for an invalid slug", () => {
		expect(isAllergenSlug("walnuts")).toBe(false);
		expect(isAllergenSlug("")).toBe(false);
		expect(isAllergenSlug(null)).toBe(false);
		expect(isAllergenSlug(undefined)).toBe(false);
		expect(isAllergenSlug(42)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// parseAllergens
// ---------------------------------------------------------------------------

describe("parseAllergens", () => {
	it("returns empty array for undefined input", () => {
		expect(parseAllergens(undefined)).toEqual([]);
	});

	it("returns empty array for non-array input", () => {
		expect(parseAllergens("peanuts")).toEqual([]);
		expect(parseAllergens(null)).toEqual([]);
	});

	it("filters out invalid slugs from mixed array", () => {
		const result = parseAllergens(["peanuts", "unknown-allergen", "milk", 42]);
		expect(result).toEqual(["peanuts", "milk"]);
	});

	it("returns all valid slugs intact", () => {
		const result = parseAllergens(["peanuts", "tree-nuts", "shellfish"]);
		expect(result).toEqual(["peanuts", "tree-nuts", "shellfish"]);
	});

	it("returns empty array for empty input array", () => {
		expect(parseAllergens([])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Canonical list completeness
// ---------------------------------------------------------------------------

describe("ALLERGEN_SLUGS and ALLERGEN_LABELS", () => {
	it("has a label for every slug", () => {
		for (const slug of ALLERGEN_SLUGS) {
			expect(ALLERGEN_LABELS[slug]).toBeDefined();
			expect(typeof ALLERGEN_LABELS[slug]).toBe("string");
		}
	});

	it("contains the Big 14 EU allergens", () => {
		const required = [
			"milk",
			"eggs",
			"fish",
			"shellfish",
			"tree-nuts",
			"peanuts",
			"wheat",
			"soybeans",
			"sesame",
			"mustard",
			"celery",
			"lupin",
			"molluscs",
			"sulphites",
		] as const;
		for (const slug of required) {
			expect(ALLERGEN_SLUGS).toContain(slug);
		}
	});
});
