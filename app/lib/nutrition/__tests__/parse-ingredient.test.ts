import { describe, expect, it } from "vitest";
import { parseIngredient } from "~/lib/nutrition/parse-ingredient";

describe("parseIngredient", () => {
	it("parses quantity, unit, and name", () => {
		expect(parseIngredient("2 cups chopped onion")).toEqual({
			quantity: 2,
			unit: "cup",
			name: "chopped onion",
			raw: "2 cups chopped onion",
		});
	});

	it("parses compact metric mass", () => {
		expect(parseIngredient("100g chicken breast")).toMatchObject({
			quantity: 100,
			unit: "g",
			name: "chicken breast",
		});
	});

	it("parses decimal quantities", () => {
		expect(parseIngredient("1.5 tbsp olive oil")).toMatchObject({
			quantity: 1.5,
			unit: "tbsp",
			name: "olive oil",
		});
	});

	it("parses simple fractions", () => {
		expect(parseIngredient("1/2 cup milk")).toMatchObject({
			quantity: 0.5,
			unit: "cup",
			name: "milk",
		});
	});

	it("parses mixed numbers", () => {
		expect(parseIngredient("1 1/2 cups flour")).toMatchObject({
			quantity: 1.5,
			unit: "cup",
			name: "flour",
		});
	});

	it("parses fl oz as a two-token unit", () => {
		expect(parseIngredient("8 fl oz milk")).toMatchObject({
			quantity: 8,
			unit: "fl oz",
			name: "milk",
		});
	});

	it("returns name-only when no quantity", () => {
		expect(parseIngredient("salt")).toEqual({
			quantity: null,
			unit: null,
			name: "salt",
			raw: "salt",
		});
	});

	it("keeps quantity without a recognized unit", () => {
		expect(parseIngredient("3 large eggs")).toMatchObject({
			quantity: 3,
			unit: null,
			name: "large eggs",
		});
	});

	it("trims and collapses whitespace", () => {
		expect(parseIngredient("  2   tsp   salt  ")).toMatchObject({
			quantity: 2,
			unit: "tsp",
			name: "salt",
		});
	});

	it("handles empty input", () => {
		expect(parseIngredient("")).toEqual({
			quantity: null,
			unit: null,
			name: "",
			raw: "",
		});
	});
});
