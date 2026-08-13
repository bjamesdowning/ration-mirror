import { describe, expect, it } from "vitest";
import { extractJsonLdRecipe } from "~/lib/import/json-ld-recipe";

function wrap(json: unknown): string {
	return `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;
}

describe("extractJsonLdRecipe", () => {
	it("extracts a top-level Recipe", () => {
		const html = wrap({
			"@type": "Recipe",
			name: "Top Pasta",
			recipeIngredient: ["spaghetti"],
		});
		const extracted = extractJsonLdRecipe(html);
		expect(extracted).toBeTruthy();
		expect(JSON.parse(extracted ?? "{}")).toMatchObject({ name: "Top Pasta" });
	});

	it("walks @graph for a Recipe node", () => {
		const html = wrap({
			"@graph": [
				{ "@type": "WebSite", name: "Food blog" },
				{
					"@type": "Recipe",
					name: "Graph Pasta",
					recipeIngredient: ["flour"],
					recipeInstructions: "Mix and bake.",
				},
			],
		});
		const extracted = extractJsonLdRecipe(html);
		expect(JSON.parse(extracted ?? "{}").name).toBe("Graph Pasta");
	});

	it("matches @type arrays such as Recipe + Article", () => {
		const html = wrap({
			"@type": ["Recipe", "Article"],
			name: "Array Pasta",
			recipeIngredient: ["eggs"],
		});
		expect(JSON.parse(extractJsonLdRecipe(html) ?? "{}").name).toBe(
			"Array Pasta",
		);
	});

	it("flattens HowToSection / HowToStep instructions", () => {
		const html = wrap({
			"@type": "Recipe",
			name: "Stepped pasta",
			recipeInstructions: [
				{
					"@type": "HowToSection",
					name: "Cook",
					itemListElement: [
						{ "@type": "HowToStep", text: "Boil water" },
						{ "@type": "HowToStep", name: "Add pasta" },
					],
				},
			],
		});
		expect(
			JSON.parse(extractJsonLdRecipe(html) ?? "{}").recipeInstructions,
		).toEqual(["Boil water", "Add pasta"]);
	});

	it("returns null when no Recipe node exists", () => {
		const html = wrap({ "@type": "Article", headline: "News" });
		expect(extractJsonLdRecipe(html)).toBeNull();
	});

	it("skips empty Recipe stubs and keeps a later usable node", () => {
		const html = wrap({
			"@graph": [
				{ "@type": "Recipe", name: "Placeholder" },
				{
					"@type": "Recipe",
					name: "Real Pasta",
					recipeIngredient: ["spaghetti"],
					recipeInstructions: "Boil and toss.",
				},
			],
		});
		expect(JSON.parse(extractJsonLdRecipe(html) ?? "{}").name).toBe(
			"Real Pasta",
		);
	});

	it("returns null for a name-only Recipe so HTML fallback can run", () => {
		const html = wrap({ "@type": "Recipe", name: "Empty card" });
		expect(extractJsonLdRecipe(html)).toBeNull();
	});
});
