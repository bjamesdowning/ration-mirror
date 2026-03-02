import { describe, expect, it } from "vitest";
import {
	normalizeForCargoDedup,
	normalizeForMatch,
	tokenize,
	tokenMatchScore,
} from "~/lib/matching";

describe("normalizeForMatch", () => {
	it("lowercases and trims input", () => {
		expect(normalizeForMatch("  Olive Oil  ")).toBe("olive oil");
	});

	it("strips punctuation", () => {
		expect(normalizeForMatch("tomato, diced")).toBe("tomato diced");
		// Punctuation is removed and resulting multiple spaces are collapsed
		expect(normalizeForMatch("'s & -")).toBe("s ");
	});

	it("collapses multiple spaces", () => {
		expect(normalizeForMatch("olive   oil")).toBe("olive oil");
	});

	it("handles empty string", () => {
		expect(normalizeForMatch("")).toBe("");
	});
});

describe("normalizeForCargoDedup", () => {
	it("applies regional synonym substitution", () => {
		// tinned -> canned
		expect(normalizeForCargoDedup("tinned tomatoes")).toContain("canned");
		// courgette -> zucchini
		expect(normalizeForCargoDedup("courgette")).toBe("zucchini");
		// aubergine -> eggplant
		expect(normalizeForCargoDedup("aubergine")).toBe("eggplant");
		// coriander -> cilantro
		expect(normalizeForCargoDedup("coriander")).toBe("cilantro");
		// prawns -> shrimp
		expect(normalizeForCargoDedup("prawns")).toBe("shrimp");
	});

	it("strips prep and packaging words", () => {
		expect(normalizeForCargoDedup("chopped onions")).toBe("onions");
		expect(normalizeForCargoDedup("diced tomatoes")).toBe("tomatoes");
		expect(normalizeForCargoDedup("frozen peas")).toBe("peas");
		expect(normalizeForCargoDedup("fresh garlic")).toBe("garlic");
		expect(normalizeForCargoDedup("dried herbs")).toBe("herbs");
	});

	it("makes tinned/canned variants match", () => {
		expect(normalizeForCargoDedup("tinned tomatoes")).toBe(
			normalizeForCargoDedup("canned tomatoes"),
		);
	});

	it("handles plain ingredient with no modifications", () => {
		expect(normalizeForCargoDedup("rice")).toBe("rice");
		expect(normalizeForCargoDedup("pasta")).toBe("pasta");
	});
});

describe("tokenize", () => {
	it("splits into tokens and strips stop words", () => {
		const tokens = tokenize("the olive oil");
		expect(tokens.has("the")).toBe(false);
		expect(tokens.has("olive")).toBe(true);
		expect(tokens.has("oil")).toBe(true);
	});

	it("strips 'a', 'an', 'of', 'and', 'or', 'for'", () => {
		const tokens = tokenize("a tin of tomatoes and an onion or garlic");
		expect(tokens.has("a")).toBe(false);
		expect(tokens.has("an")).toBe(false);
		expect(tokens.has("of")).toBe(false);
		expect(tokens.has("and")).toBe(false);
		expect(tokens.has("or")).toBe(false);
		expect(tokens.has("for")).toBe(false);
		expect(tokens.has("tin")).toBe(true);
		expect(tokens.has("tomatoes")).toBe(true);
	});

	it("filters single-character tokens", () => {
		const tokens = tokenize("a b c onion");
		expect(tokens.has("a")).toBe(false);
		expect(tokens.has("b")).toBe(false);
		expect(tokens.has("c")).toBe(false);
		expect(tokens.has("onion")).toBe(true);
	});

	it("returns empty set for empty string", () => {
		expect(tokenize("").size).toBe(0);
	});

	it("is case-insensitive (via normalizeForMatch)", () => {
		const tokens = tokenize("Olive Oil");
		expect(tokens.has("olive")).toBe(true);
		expect(tokens.has("oil")).toBe(true);
	});
});

describe("tokenMatchScore", () => {
	it("returns 1 for identical strings", () => {
		expect(tokenMatchScore("chicken breast", "chicken breast")).toBe(1);
	});

	it("returns 1 when one is a subset of the other", () => {
		// "chicken" is fully contained in "chicken breast"
		expect(tokenMatchScore("chicken", "chicken breast")).toBe(1);
	});

	it("returns 0 for completely different strings", () => {
		expect(tokenMatchScore("apple", "orange")).toBe(0);
	});

	it("returns partial score for partial overlap", () => {
		const score = tokenMatchScore("chicken thigh", "chicken breast");
		expect(score).toBeGreaterThan(0);
		expect(score).toBeLessThan(1);
	});

	it("returns 0 for empty strings", () => {
		expect(tokenMatchScore("", "chicken")).toBe(0);
		expect(tokenMatchScore("chicken", "")).toBe(0);
		expect(tokenMatchScore("", "")).toBe(0);
	});

	it("is symmetric", () => {
		const ab = tokenMatchScore("olive oil", "extra virgin olive oil");
		const ba = tokenMatchScore("extra virgin olive oil", "olive oil");
		expect(ab).toBe(ba);
	});
});
