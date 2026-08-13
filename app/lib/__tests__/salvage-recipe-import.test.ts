import { describe, expect, it } from "vitest";
import { salvageRecipeImportPayload } from "~/lib/import/salvage-recipe-import";

describe("salvageRecipeImportPayload", () => {
	it("salvages a skeleton from error-shaped JSON with ingredient names", () => {
		const salvaged = salvageRecipeImportPayload({
			status: "error",
			code: "NOT_A_RECIPE",
			title: "Yummy pasta",
			ingredients: [{ name: "spaghetti" }, "eggs"],
			steps: [{ text: "Boil the pasta" }, "Toss with cheese"],
		});
		expect(salvaged).not.toBeNull();
		expect(salvaged?.completeness).toBe("skeleton");
		expect(salvaged?.ingredients.map((i) => i.name)).toEqual([
			"spaghetti",
			"eggs",
		]);
		expect(salvaged?.ingredients[0]?.quantity).toBe(0);
		expect(salvaged?.ingredients[0]?.unit).toBe("unit");
		expect(salvaged?.steps).toEqual(["Boil the pasta", "Toss with cheese"]);
	});

	it("returns null when neither ingredients nor steps can be recovered", () => {
		expect(
			salvageRecipeImportPayload({
				status: "error",
				code: "NOT_A_RECIPE",
				ingredients: [],
				steps: [],
			}),
		).toBeNull();
	});

	it("accepts repaired JSON with trailing commas after parseModelJson-style objects", () => {
		const salvaged = salvageRecipeImportPayload({
			status: "ok",
			title: "Spoken carbonara",
			ingredients: [{ ingredientName: "pancetta", quantity: 100, unit: "g" }],
			steps: ["Fry pancetta"],
		});
		expect(salvaged?.ingredients[0]).toMatchObject({
			name: "pancetta",
			quantity: 100,
			unit: "g",
		});
	});
});
