import { describe, expect, it } from "vitest";
import { dedupeTagSlugs } from "../tags";
import { mergeEntityIdsForTagFilter } from "../tags.server";

describe("mergeEntityIdsForTagFilter", () => {
	it("returns union for OR mode", () => {
		expect(
			mergeEntityIdsForTagFilter(
				[
					["a", "b"],
					["b", "c"],
				],
				"or",
			),
		).toEqual(["a", "b", "c"]);
	});

	it("returns intersection for AND mode", () => {
		expect(
			mergeEntityIdsForTagFilter(
				[
					["a", "b", "c"],
					["b", "c", "d"],
				],
				"and",
			),
		).toEqual(["b", "c"]);
	});

	it("returns empty when AND sets do not overlap", () => {
		expect(mergeEntityIdsForTagFilter([["a"], ["b"]], "and")).toEqual([]);
	});
});

describe("dedupeTagSlugs integration with filter inputs", () => {
	it("normalizes slugs before filter matching", () => {
		const slugs = dedupeTagSlugs([" Weeknight ", "weeknight", "Freezer"]);
		expect(slugs).toEqual(["weeknight", "freezer"]);
		expect(
			mergeEntityIdsForTagFilter([slugs.map(() => "meal-1"), ["meal-2"]], "or"),
		).toEqual(["meal-1", "meal-2"]);
	});
});
