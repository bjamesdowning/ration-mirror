import { describe, expect, it } from "vitest";
import { filterSupplyItemsByCargoTags } from "~/lib/supply.server";

describe("filterSupplyItemsByCargoTags", () => {
	const cargo = [
		{
			name: "Milk",
			tags: [
				{
					id: "1",
					slug: "costco",
					name: "Costco",
					color: null,
					category: null,
				},
			],
		},
		{
			name: "Bread",
			tags: [
				{ id: "2", slug: "local", name: "Local", color: null, category: null },
			],
		},
		{
			name: "Eggs",
			tags: [
				{
					id: "3",
					slug: "costco",
					name: "Costco",
					color: null,
					category: null,
				},
				{
					id: "4",
					slug: "organic",
					name: "Organic",
					color: null,
					category: null,
				},
			],
		},
	];

	it("returns all items when no supply tags", () => {
		const items = [{ name: "Milk" }, { name: "Bread" }];
		expect(filterSupplyItemsByCargoTags(items, cargo, undefined)).toEqual(
			items,
		);
	});

	it("filters items by cargo tag OR logic", () => {
		const items = [{ name: "Milk" }, { name: "Bread" }, { name: "Eggs" }];
		const result = filterSupplyItemsByCargoTags(items, cargo, ["costco"]);
		expect(result.map((i) => i.name)).toEqual(["Milk", "Eggs"]);
	});
});
