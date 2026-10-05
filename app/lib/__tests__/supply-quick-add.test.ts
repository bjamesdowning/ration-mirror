import { describe, expect, it } from "vitest";
import { parseSupplyQuickAdd } from "../supply-quick-add";

describe("parseSupplyQuickAdd", () => {
	it("splits a comma-separated store jot and keeps household items", () => {
		const items = parseSupplyQuickAdd(
			"butter, eggs, bread, milk, yogurt, shampoo",
		);
		expect(items.map((item) => item.name)).toEqual([
			"butter",
			"eggs",
			"bread",
			"milk",
			"yogurt",
			"shampoo",
		]);
		expect(items.find((item) => item.name === "shampoo")?.domain).toBe(
			"household",
		);
		expect(items.find((item) => item.name === "milk")).toMatchObject({
			quantity: 1,
			unit: "unit",
			domain: "food",
		});
	});

	it("strips a spoken preamble and keeps bread and butter as one item", () => {
		expect(
			parseSupplyQuickAdd("okay I need bread and butter, eggs").map(
				(item) => item.name,
			),
		).toEqual(["bread and butter", "eggs"]);
	});

	it("reads quantities, units, and new lines", () => {
		expect(parseSupplyQuickAdd("2 lb chicken\n2x milk")).toEqual([
			{ name: "chicken", quantity: 2, unit: "lb", domain: "food" },
			{ name: "milk", quantity: 2, unit: "unit", domain: "food" },
		]);
	});

	it("sums repeated lines in the same jot", () => {
		expect(parseSupplyQuickAdd("milk, 2x milk")).toEqual([
			{ name: "milk", quantity: 3, unit: "unit", domain: "food" },
		]);
	});

	it("keeps 2% milk as a name", () => {
		expect(parseSupplyQuickAdd("2% milk").map((item) => item.name)).toEqual([
			"2% milk",
		]);
	});

	it("returns nothing for an empty preamble", () => {
		expect(parseSupplyQuickAdd("okay, I need")).toEqual([]);
	});
});
