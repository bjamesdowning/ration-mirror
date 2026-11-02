import { describe, expect, it } from "vitest";
import { projectToolResult, toAgentMealIndexItem } from "../response-profile";

describe("agent meal index", () => {
	it("stays under a fixed size for a 20-meal galley", () => {
		const meals = Array.from({ length: 20 }, (_, index) =>
			toAgentMealIndexItem({
				id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
				name: `meal ${index}`,
				type: "recipe",
				servings: 4,
				domain: "food",
				tags: [{ slug: "dinner", name: "Dinner", id: "tag-1" }],
				nutritionStatus: "current",
				nutrition: {
					perServing: {
						energyKcal: 512.1234,
						proteinG: 21.5,
						carbG: 40.2,
						fatG: 18,
						fiberG: 4,
					},
					coverage: 0.9,
					attributions: [{ ingredientName: "rice", grams: 420 }],
					computedAt: "2026-11-02T00:00:00.000Z",
					recipeMassG: 420,
				},
				ingredients: [],
			}),
		);
		const projected = projectToolResult({
			tool: "list_meals",
			profile: "agent",
			data: meals,
			args: { includeIngredients: false },
		});
		const encoded = JSON.stringify(projected.data);
		expect(encoded.length).toBeLessThan(8_000);
		expect(encoded).not.toContain("attributions");
		expect(encoded).not.toContain("recipeMassG");
		expect(encoded).not.toContain('"ingredients"');
		expect(projected.meta?.ingredients).toBe("omitted");
		const first = (projected.data as Array<Record<string, unknown>>)[0];
		expect(first?.nutrition).toMatchObject({
			perServing: { carbsG: 40.2 },
		});
	});
});
