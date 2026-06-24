import { describe, expect, it } from "vitest";
import { sortSupplyItems } from "~/lib/supply-sort";

const items = [
	{ id: "1", name: "zucchini", isPurchased: false },
	{ id: "2", name: "apple", isPurchased: true },
	{ id: "3", name: "banana", isPurchased: false },
	{ id: "4", name: "carrot", isPurchased: true },
];

describe("sortSupplyItems", () => {
	it("preserves order for added mode", () => {
		const sorted = sortSupplyItems(items, "added");
		expect(sorted.map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
	});

	it("sorts alphabetically for alpha mode", () => {
		const sorted = sortSupplyItems(items, "alpha");
		expect(sorted.map((i) => i.name)).toEqual([
			"apple",
			"banana",
			"carrot",
			"zucchini",
		]);
	});

	it("puts unpurchased first then alpha for unpurchased mode", () => {
		const sorted = sortSupplyItems(items, "unpurchased");
		expect(sorted.map((i) => i.name)).toEqual([
			"banana",
			"zucchini",
			"apple",
			"carrot",
		]);
	});

	it("does not mutate the input array", () => {
		const copy = [...items];
		sortSupplyItems(items, "alpha");
		expect(items).toEqual(copy);
	});
});
