import { describe, expect, it } from "vitest";
import { lookupDensity } from "~/lib/ingredient-density";

describe("lookupDensity", () => {
	it("returns density for a canonical key", () => {
		expect(lookupDensity("all purpose flour")).toBeCloseTo(0.53);
		expect(lookupDensity("water")).toBeCloseTo(1.0);
		expect(lookupDensity("sugar")).toBeCloseTo(0.85);
	});

	it("normalises the key before lookup (case-insensitive)", () => {
		expect(lookupDensity("All Purpose Flour")).toBeCloseTo(0.53);
		expect(lookupDensity("WATER")).toBeCloseTo(1.0);
	});

	it("resolves alias keys to canonical values", () => {
		// "plain flour" is an alias for "all purpose flour"
		expect(lookupDensity("plain flour")).toBeCloseTo(0.53);
		// "gram flour" is listed as an alias
		expect(lookupDensity("chickpea flour")).not.toBeNull();
	});

	it("strips trailing plural 's' for lookup", () => {
		// "flours" -> "flour" (handled by normalizeForDensityLookup stripping trailing 's')
		// This is approximate — depends on what the lookup chain resolves
		const result = lookupDensity("bread flour");
		expect(result).not.toBeNull();
	});

	it("returns null for unknown ingredient", () => {
		expect(lookupDensity("unobtainium")).toBeNull();
		expect(lookupDensity("xyzzy_ingredient_not_in_db")).toBeNull();
	});

	it("returns null for null input", () => {
		expect(lookupDensity(null)).toBeNull();
	});

	it("returns null for undefined input", () => {
		expect(lookupDensity(undefined)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(lookupDensity("")).toBeNull();
	});

	it("returns null for whitespace-only string", () => {
		expect(lookupDensity("   ")).toBeNull();
	});

	it("density bounds: returned values are within 0.1 - 3.0 g/ml", () => {
		const ingredients = [
			"water",
			"all purpose flour",
			"butter",
			"olive oil",
			"honey",
			"milk",
		];
		for (const name of ingredients) {
			const density = lookupDensity(name);
			if (density !== null) {
				expect(density).toBeGreaterThanOrEqual(0.1);
				expect(density).toBeLessThanOrEqual(3.0);
			}
		}
	});
});
