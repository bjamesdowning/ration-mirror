import { describe, expect, it } from "vitest";
import {
	humanizeSupplyOrigins,
	isManualOnlySupplyItem,
	mergeSupplyOrigins,
	normalizeSupplyOrigins,
	SUPPLY_ORIGIN_ORDER,
	shouldClearUnpurchasedSupplyItemOnSync,
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

	it("isManualOnlySupplyItem accepts unpurchased quick-add rows", () => {
		expect(
			isManualOnlySupplyItem({
				sourceMealId: null,
				sourceCargoId: null,
				sourceMealIds: [],
				sourceOrigins: ["manual"],
			}),
		).toBe(true);
	});

	it("isManualOnlySupplyItem rejects auto-sourced rows without FK ids", () => {
		expect(
			isManualOnlySupplyItem({
				sourceMealId: null,
				sourceCargoId: null,
				sourceMealIds: [],
				sourceOrigins: ["manifest"],
			}),
		).toBe(false);
		expect(
			isManualOnlySupplyItem({
				sourceMealId: null,
				sourceCargoId: null,
				sourceMealIds: ["meal-1"],
				sourceOrigins: [],
			}),
		).toBe(false);
	});

	it("shouldClearUnpurchasedSupplyItemOnSync clears auto rows and keeps manual or purchased", () => {
		expect(
			shouldClearUnpurchasedSupplyItemOnSync({
				isPurchased: false,
				sourceOrigins: ["cargo"],
			}),
		).toBe(true);
		expect(
			shouldClearUnpurchasedSupplyItemOnSync({
				isPurchased: false,
				sourceOrigins: ["manual"],
			}),
		).toBe(false);
		expect(
			shouldClearUnpurchasedSupplyItemOnSync({
				isPurchased: true,
				sourceOrigins: ["manifest"],
				sourceMealId: "meal-1",
			}),
		).toBe(false);
	});
});
