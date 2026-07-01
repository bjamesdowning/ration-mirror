import { describe, expect, it } from "vitest";
import { normalizeMobileGeneratedRecipes } from "../generated-recipes.server";

describe("normalizeMobileGeneratedRecipes", () => {
	it("converts string[] directions and name-keyed ingredients", () => {
		const [recipe] = normalizeMobileGeneratedRecipes([
			{
				name: "Potato Salad",
				description: "Classic side",
				directions: [
					"Boil potatoes until tender, about 15 minutes.",
					"Mix mayonnaise with mustard and celery.",
					"Fold potatoes into dressing gently.",
					"Chill for at least one hour before serving.",
				],
				ingredients: [
					{
						name: "potato",
						quantity: 4,
						unit: "unit",
						inventoryName: "potato",
					},
				],
				prepTime: 10,
				cookTime: 20,
			},
		]);

		expect(recipe.name).toBe("Potato Salad");
		expect(recipe.directions).toContain('"position":1');
		expect(recipe.ingredients[0]?.ingredientName).toBe("potato");
		expect(recipe.tags).toEqual(["ai-generated"]);
		expect(recipe.servings).toBe(1);
	});

	it("preserves existing tags and servings when provided", () => {
		const [recipe] = normalizeMobileGeneratedRecipes([
			{
				name: "Test",
				directions:
					"Step one long enough\nStep two long enough\nStep three long enough\nStep four long enough",
				servings: 4,
				tags: ["weeknight"],
			},
		]);

		expect(recipe.servings).toBe(4);
		expect(recipe.tags).toEqual(["weeknight"]);
	});
});
