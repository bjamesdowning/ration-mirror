import { describe, expect, it } from "vitest";
import { filterIngredients } from "../IngredientCombobox";
import { INGREDIENT_CATEGORIES } from "../UnitConverterForm";

const all = INGREDIENT_CATEGORIES.flatMap((c) =>
	c.items.map((i) => ({ ...i, category: c.category })),
);
const labels = (q: string) => filterIngredients(all, q).map((i) => i.label);

describe("filterIngredients", () => {
	it("matches names, not category-only", () => {
		const r = labels("choc");
		expect(r).toContain("Chocolate chips");
		expect(r).not.toContain("Mixed nuts");
		expect(r).not.toContain("Ground almonds");
	});

	it("ranks names starting with the query first", () => {
		expect(labels("butter")[0]).toBe("Butter");
		const sugar = labels("sugar");
		expect(sugar.length).toBeGreaterThan(1);
		expect(sugar.every((l) => l.toLowerCase().includes("sugar"))).toBe(true);
	});

	it("returns everything for an empty query and nothing for nonsense", () => {
		expect(filterIngredients(all, "  ")).toHaveLength(all.length);
		expect(labels("zzzz")).toEqual([]);
	});
});
