import { describe, expect, it } from "vitest";
import {
	buildImportHolderMeal,
	extractHtmlDocumentTitle,
	extractOgTitle,
	holderDescription,
	holderMealName,
} from "~/lib/import/build-import-holder";
import {
	classifyAiSuccessCompleteness,
	isImportCompleteness,
} from "~/lib/import/import-completeness";

describe("holderMealName", () => {
	it("uses title when present", () => {
		expect(holderMealName("Smashburger", "https://tiktok.com/@x/video/1")).toBe(
			"Smashburger",
		);
	});

	it("falls back to hostname when title missing", () => {
		expect(holderMealName(null, "https://www.tiktok.com/@x/video/1")).toBe(
			"Recipe from tiktok.com",
		);
	});

	it("ignores URL-looking titles", () => {
		expect(
			holderMealName(
				"https://tiktok.com/@x/video/1",
				"https://tiktok.com/@x/video/1",
			),
		).toBe("Recipe from tiktok.com");
	});
});

describe("holderDescription", () => {
	it("always includes the source URL", () => {
		const desc = holderDescription("https://example.com/r");
		expect(desc).toContain("https://example.com/r");
		expect(desc.toLowerCase()).toContain("source");
	});
});

describe("HTML title helpers", () => {
	it("extracts document title", () => {
		expect(
			extractHtmlDocumentTitle(
				"<html><title>Pasta Night | Blog</title></html>",
			),
		).toBe("Pasta Night");
	});

	it("extracts og:title", () => {
		expect(
			extractOgTitle(`<meta property="og:title" content="Best Chili" />`),
		).toBe("Best Chili");
	});
});

describe("buildImportHolderMeal", () => {
	it("builds a link_holder with sourceUrl and placeholder step", () => {
		const { meal, completeness } = buildImportHolderMeal({
			sourceUrl: "https://www.tiktok.com/@chef/video/99",
			sourceKind: "tiktok",
			title: "Smash Burger",
			importTag: "social-import",
		});
		expect(completeness).toBe("link_holder");
		expect(meal.name).toBe("smash burger");
		expect(meal.description).toContain("https://www.tiktok.com/@chef/video/99");
		expect(meal.customFields.sourceUrl).toBe(
			"https://www.tiktok.com/@chef/video/99",
		);
		expect(meal.customFields.importCompleteness).toBe("link_holder");
		expect(meal.ingredients).toEqual([]);
		expect(meal.directions).toBeTruthy();
	});

	it("upgrades to skeleton when partial ingredients exist", () => {
		const { meal, completeness } = buildImportHolderMeal({
			sourceUrl: "https://youtube.com/watch?v=abc",
			sourceKind: "youtube",
			title: "Chili",
			ingredients: [{ name: "beef", quantity: 0, unit: "unit" }],
			steps: ["Brown the beef"],
		});
		expect(completeness).toBe("skeleton");
		expect(meal.customFields.importCompleteness).toBe("skeleton");
		expect(meal.ingredients).toHaveLength(1);
		expect(meal.ingredients[0]?.ingredientName).toBe("beef");
	});
});

describe("classifyAiSuccessCompleteness", () => {
	it("marks rich recipes as full", () => {
		expect(
			classifyAiSuccessCompleteness({
				ingredients: [
					{ name: "flour", quantity: 200, unit: "g" },
					{ name: "milk", quantity: 100, unit: "ml" },
				],
				steps: ["Mix", "Rest", "Bake until golden"],
			}),
		).toBe("full");
	});

	it("marks thin recipes as skeleton", () => {
		expect(
			classifyAiSuccessCompleteness({
				ingredients: [{ name: "beef", quantity: 0, unit: "unit" }],
				steps: ["Cook it"],
			}),
		).toBe("skeleton");
	});
});

describe("isImportCompleteness", () => {
	it("accepts known values", () => {
		expect(isImportCompleteness("full")).toBe(true);
		expect(isImportCompleteness("skeleton")).toBe(true);
		expect(isImportCompleteness("link_holder")).toBe(true);
		expect(isImportCompleteness("nope")).toBe(false);
	});
});
