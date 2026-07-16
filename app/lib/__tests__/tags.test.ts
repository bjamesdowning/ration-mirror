import { describe, expect, it } from "vitest";
import {
	dedupeTagSlugs,
	formatTagName,
	isValidTagSlug,
	normalizeTagSlug,
	parseTagSlugsInput,
	sanitizeTagColor,
	type TagRecord,
	tagsFromSearchParam,
	tagsToSearchParam,
	toTagSlugs,
	uniqueTagSlugs,
} from "../tags";

describe("normalizeTagSlug", () => {
	it("lowercases and hyphenates", () => {
		expect(normalizeTagSlug("  Gluten Free  ")).toBe("gluten-free");
	});

	it("strips invalid characters", () => {
		expect(normalizeTagSlug("hello@world!")).toBe("helloworld");
	});
});

describe("formatTagName", () => {
	it("title-cases slug words", () => {
		expect(formatTagName("meal-prep")).toBe("Meal Prep");
	});
});

describe("dedupeTagSlugs", () => {
	it("dedupes and caps at 10", () => {
		const slugs = Array.from({ length: 12 }, (_, i) => `tag-${i}`);
		expect(dedupeTagSlugs(slugs)).toHaveLength(10);
	});

	it("merges case variants", () => {
		expect(dedupeTagSlugs(["Italian", "italian", "ITALIAN"])).toEqual([
			"italian",
		]);
	});
});

describe("uniqueTagSlugs", () => {
	it("dedupes without the per-entity cap", () => {
		const slugs = Array.from({ length: 12 }, (_, i) => `tag-${i}`);
		expect(uniqueTagSlugs(slugs)).toHaveLength(12);
	});
});

describe("parseTagSlugsInput", () => {
	it("parses comma-separated string", () => {
		expect(parseTagSlugsInput("a, b, c")).toEqual(["a", "b", "c"]);
	});
});

describe("tags search params", () => {
	it("round-trips slug list", () => {
		const param = tagsToSearchParam(["weeknight", "freezer"]);
		expect(tagsFromSearchParam(param)).toEqual(["weeknight", "freezer"]);
	});
});

describe("isValidTagSlug", () => {
	it("rejects empty and invalid", () => {
		expect(isValidTagSlug("")).toBe(false);
		expect(isValidTagSlug("Bad Slug")).toBe(false);
		expect(isValidTagSlug("good-slug")).toBe(true);
	});
});

describe("toTagSlugs", () => {
	it("extracts slugs from TagRecord objects", () => {
		const tags: TagRecord[] = [
			{
				id: "1",
				slug: "italian",
				name: "Italian",
				color: null,
				category: null,
			},
			{
				id: "2",
				slug: "vegan",
				name: "Vegan",
				color: "#00E088",
				category: "diet",
			},
		];
		expect(toTagSlugs(tags)).toEqual(["italian", "vegan"]);
	});

	it("passes through legacy string-slug arrays", () => {
		expect(toTagSlugs(["weeknight", "freezer"])).toEqual([
			"weeknight",
			"freezer",
		]);
	});

	it("returns an empty array for undefined or empty input", () => {
		expect(toTagSlugs(undefined)).toEqual([]);
		expect(toTagSlugs([])).toEqual([]);
	});
});

describe("sanitizeTagColor", () => {
	it("accepts valid hex colors", () => {
		expect(sanitizeTagColor("#00E088")).toBe("#00E088");
		expect(sanitizeTagColor("#3b82f6")).toBe("#3b82f6");
	});

	it("rejects CSS injection and invalid values", () => {
		expect(sanitizeTagColor("red")).toBeNull();
		expect(sanitizeTagColor("#fff")).toBeNull();
		expect(sanitizeTagColor("url(javascript:alert(1))")).toBeNull();
		expect(sanitizeTagColor(null)).toBeNull();
	});
});
