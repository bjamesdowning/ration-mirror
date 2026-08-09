import { describe, expect, it } from "vitest";
import {
	gramsFromMassResolution,
	resolveIngredientMass,
} from "../mass-resolution";

describe("resolveIngredientMass", () => {
	it("uses explicit grams when provided", () => {
		const result = resolveIngredientMass(null, null, "onion", {
			explicitGrams: 150,
		});
		expect(result).toEqual({
			grams: 150,
			method: "explicit",
			confidence: 1,
			estimated: false,
		});
	});

	it("resolves weight units as direct_mass", () => {
		const result = resolveIngredientMass(500, "g", "flour");
		expect(result.method).toBe("direct_mass");
		expect(result.grams).toBe(500);
		expect(result.estimated).toBe(false);
	});

	it("uses density for known liquids", () => {
		const result = resolveIngredientMass(1, "l", "organic whole milk");
		expect(result.method).toBe("density");
		expect(result.grams).toBeCloseTo(1030, 0);
		expect(result.estimated).toBe(true);
	});

	it("falls back to assumed_1g_ml for unknown volume names", () => {
		const result = resolveIngredientMass(1, "l", "exotic nebula tonic");
		expect(result.method).toBe("assumed_1g_ml");
		expect(result.grams).toBe(1000);
		expect(result.confidence).toBeLessThan(0.5);
	});

	it("returns unknown for count units", () => {
		const result = resolveIngredientMass(1, "unit", "milk");
		expect(result.method).toBe("unknown");
		expect(result.grams).toBeNull();
	});
});

describe("gramsFromMassResolution", () => {
	it("matches v1.7.40 package-scale regression expectations", () => {
		expect(gramsFromMassResolution(1, "l", "organic whole milk")).toBeCloseTo(
			1030,
			0,
		);
		expect(gramsFromMassResolution(1, "l", "exotic nebula tonic")).toBe(1000);
		expect(gramsFromMassResolution(1, "unit", "milk")).toBeNull();
	});
});
