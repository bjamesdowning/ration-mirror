import { describe, expect, it } from "vitest";
import { convertToolUnits, isCrossKind } from "../tool-units";

describe("convertToolUnits", () => {
	it("converts US and UK/metric volumes", () => {
		expect(convertToolUnits(1, "cup_metric", "ml")).toBe(250);
		expect(convertToolUnits(1, "pt_uk", "ml")).toBeCloseTo(568.26, 2);
		expect(convertToolUnits(1, "fl_oz_uk", "ml")).toBeCloseTo(28.41, 2);
		expect(convertToolUnits(1, "pt_uk", "pt")).toBeCloseTo(1.201, 3);
		expect(convertToolUnits(1, "cl", "ml")).toBe(10);
		expect(convertToolUnits(16, "pinch", "tsp")).toBeCloseTo(1);
	});

	it("converts a stick of butter", () => {
		expect(convertToolUnits(1, "stick", "g")).toBe(113);
		expect(convertToolUnits(4, "stick", "lb")).toBeCloseTo(0.9965, 3);
		// 1 stick of butter (0.96 g/ml) ≈ ½ US cup
		expect(convertToolUnits(1, "stick", "cup", 0.96)).toBeCloseTo(0.4975, 3);
	});

	it("needs a density for volume ↔ weight", () => {
		expect(isCrossKind("cup", "g")).toBe(true);
		expect(convertToolUnits(1, "cup", "g")).toBeNull();
		expect(convertToolUnits(1, "cup", "g", 0.53)).toBeCloseTo(125.39, 2);
		expect(convertToolUnits(250, "g", "cup_metric", 1)).toBe(1);
	});

	it("rejects unknown units", () => {
		expect(convertToolUnits(1, "cup", "bogus")).toBeNull();
	});
});
