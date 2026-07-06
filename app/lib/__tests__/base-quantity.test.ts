import { describe, expect, it } from "vitest";
import { computeBaseFields } from "../base-quantity";

describe("computeBaseFields", () => {
	it("normalizes weight to grams", () => {
		expect(computeBaseFields(2, "kg")).toEqual({
			baseQuantity: 2000,
			baseUnit: "g",
		});
	});

	it("normalizes volume to milliliters", () => {
		const result = computeBaseFields(1, "cup");
		expect(result.baseUnit).toBe("ml");
		expect(result.baseQuantity).toBeCloseTo(236.588, 2);
	});

	it("canonicalizes flour cups to grams via density", () => {
		const result = computeBaseFields(1, "cup", "all-purpose flour");
		expect(result.baseUnit).toBe("g");
		expect(result.baseQuantity).toBeGreaterThan(100);
	});

	it("keeps likely liquids volume-based", () => {
		const result = computeBaseFields(1, "cup", "milk");
		expect(result.baseUnit).toBe("ml");
		expect(result.baseQuantity).toBeCloseTo(236.588, 2);
	});

	it("falls back safely for invalid units", () => {
		expect(computeBaseFields(3, "bogus", "item")).toEqual({
			baseQuantity: 3,
			baseUnit: "unit",
		});
	});
});
