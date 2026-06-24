import { describe, expect, it } from "vitest";
import { resolveSupplyItemSources } from "../supply-sources";

describe("resolveSupplyItemSources", () => {
	it("returns empty array when no source data", () => {
		expect(resolveSupplyItemSources({ sourceMealName: null })).toEqual([]);
		expect(
			resolveSupplyItemSources({
				sourceMealName: undefined,
				sourceMealNames: [],
			}),
		).toEqual([]);
	});

	it("prefers sourceMealSources when present", () => {
		expect(
			resolveSupplyItemSources({
				sourceMealName: "Legacy",
				sourceMealNames: ["Other"],
				sourceMealSources: [{ id: "meal-1", name: "Tacos" }],
			}),
		).toEqual([{ id: "meal-1", name: "Tacos" }]);
	});

	it("falls back to sourceMealNames", () => {
		expect(
			resolveSupplyItemSources({
				sourceMealNames: ["Soup", "Salad"],
			}),
		).toEqual([
			{ id: null, name: "Soup" },
			{ id: null, name: "Salad" },
		]);
	});

	it("falls back to single sourceMealName", () => {
		expect(resolveSupplyItemSources({ sourceMealName: "Pasta Night" })).toEqual(
			[{ id: null, name: "Pasta Night" }],
		);
	});
});
