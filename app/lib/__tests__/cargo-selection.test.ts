import { describe, expect, it } from "vitest";
import {
	humanizeSupplyOrigins,
	mergeSupplyOrigins,
	normalizeSupplyOrigins,
} from "../supply-item-origins";

describe("cargo-selection integration (origins)", () => {
	it("cargo origin merges with existing galley/manifest origins", () => {
		expect(mergeSupplyOrigins(["manifest", "galley"], ["cargo"])).toEqual([
			"manifest",
			"galley",
			"cargo",
		]);
	});

	it("normalizeSupplyOrigins handles persisted JSON shapes", () => {
		expect(normalizeSupplyOrigins(["cargo", "manual"])).toEqual([
			"cargo",
			"manual",
		]);
		expect(humanizeSupplyOrigins(["cargo"])).toBe("Cargo");
	});
});
