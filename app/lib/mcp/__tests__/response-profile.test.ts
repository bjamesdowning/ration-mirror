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

describe("supply quantity rounding", () => {
	it("rounds to 2 decimals and drops trailing zeros", async () => {
		const { roundSupplyQuantity } = await import("../response-profile");
		expect(roundSupplyQuantity(0.30000000000000004)).toBe(0.3);
		expect(roundSupplyQuantity(1.005)).toBe(1.01);
		expect(roundSupplyQuantity(2.499999)).toBe(2.5);
		expect(roundSupplyQuantity(3)).toBe(3);
		expect(JSON.stringify(roundSupplyQuantity(1.1))).toBe("1.1");
	});

	it("rounds nested quantity fields for supply tools only", () => {
		const data = {
			items: [
				{ name: "rice", quantity: 1.3333333, unit: "kg" },
				{ name: "milk", quantity: 0.1 + 0.2, unit: "l" },
			],
		};
		const supply = projectToolResult({
			tool: "get_supply_list",
			profile: "agent",
			data,
		}).data as { items: { quantity: number }[] };
		expect(supply.items.map((i) => i.quantity)).toEqual([1.33, 0.3]);

		const card = projectToolResult({
			tool: "add_supply_item",
			profile: "card",
			data: { quantity: 2.0049 },
		}).data as { quantity: number };
		expect(card.quantity).toBe(2);

		const cargo = projectToolResult({
			tool: "list_inventory",
			profile: "agent",
			data: { quantity: 1.3333333 },
		}).data as { quantity: number };
		expect(cargo.quantity).toBe(1.3333333);
	});
});
