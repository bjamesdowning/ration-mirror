import { describe, expect, it } from "vitest";
import { lookupDensity } from "~/lib/ingredient-density";
import { INGREDIENT_CATEGORIES } from "../UnitConverterForm";

describe("unit converter ingredient picker", () => {
	const items = INGREDIENT_CATEGORIES.flatMap((c) => c.items);

	it("has a density for every ingredient", () => {
		for (const item of items) {
			expect(lookupDensity(item.key), item.key).not.toBeNull();
		}
	});

	it("includes chocolate chips, nuts and condensed milk", () => {
		const keys = items.map((i) => i.key);
		expect(keys).toEqual(
			expect.arrayContaining([
				"chocolate chips",
				"nuts",
				"sweetened condensed milk",
			]),
		);
	});

	it("has unique keys", () => {
		expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
	});
});
