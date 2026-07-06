import { describe, expect, it } from "vitest";
import {
	humanizeSupplyOrigins,
	mergeSupplyOrigins,
	normalizeSupplyOrigins,
	SUPPLY_ORIGIN_ORDER,
} from "../supply-item-origins";

describe("supply-item-origins", () => {
	it("mergeSupplyOrigins dedupes and preserves canonical order", () => {
		expect(mergeSupplyOrigins(["galley"], ["manifest", "galley"])).toEqual([
			"manifest",
			"galley",
		]);
		expect(mergeSupplyOrigins(undefined, ["cargo"])).toEqual(["cargo"]);
	});

	it("normalizeSupplyOrigins filters invalid values", () => {
		expect(
			normalizeSupplyOrigins(["manifest", "invalid", "galley", 1, null]),
		).toEqual(["manifest", "galley"]);
		expect(normalizeSupplyOrigins("not-array")).toEqual([]);
	});

	it("humanizeSupplyOrigins joins channel labels", () => {
		expect(humanizeSupplyOrigins(["manifest", "galley"])).toBe(
			"Manifest and Galley",
		);
		expect(humanizeSupplyOrigins([])).toBe("Added manually");
	});

	it("SUPPLY_ORIGIN_ORDER lists all channels", () => {
		expect(SUPPLY_ORIGIN_ORDER).toEqual([
			"manifest",
			"galley",
			"cargo",
			"manual",
		]);
	});
});
