import { describe, expect, it } from "vitest";
import { filterSupplyItemsByCargoTags } from "~/lib/supply.server";

describe("filterSupplyItemsByCargoTags", () => {
	const cargo = [
		{ name: "Milk", tags: ["costco"] },
		{ name: "Bread", tags: ["local"] },
		{ name: "Eggs", tags: JSON.stringify(["costco", "organic"]) },
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
