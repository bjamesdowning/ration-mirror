import { describe, expect, it } from "vitest";
import {
	areSameFamily,
	chooseReadableUnit,
	convertIngredientAmount,
	convertQuantity,
	convertQuantityWithDensity,
	getUnitMultiplier,
	normalizeToBaseUnit,
	normalizeUnitAlias,
	toCookingUnit,
	toShoppingUnit,
	toSupportedUnit,
} from "~/lib/units";

describe("toSupportedUnit", () => {
	it("returns canonical unit for exact match", () => {
		expect(toSupportedUnit("g")).toBe("g");
		expect(toSupportedUnit("kg")).toBe("kg");
		expect(toSupportedUnit("ml")).toBe("ml");
		expect(toSupportedUnit("cup")).toBe("cup");
		expect(toSupportedUnit("fl oz")).toBe("fl oz");
	});

	it("lowercases input before matching", () => {
		expect(toSupportedUnit("KG")).toBe("kg");
		expect(toSupportedUnit("ML")).toBe("ml");
	});

	it("trims whitespace", () => {
		expect(toSupportedUnit("  g  ")).toBe("g");
	});

	it("returns 'unit' for unknown input", () => {
		expect(toSupportedUnit("stone")).toBe("unit");
		expect(toSupportedUnit("")).toBe("unit");
		expect(toSupportedUnit(null)).toBe("unit");
		expect(toSupportedUnit(undefined)).toBe("unit");
		expect(toSupportedUnit("banana")).toBe("unit");
	});
});

describe("normalizeUnitAlias", () => {
	it("resolves plural aliases", () => {
		expect(normalizeUnitAlias("grams")).toBe("g");
		expect(normalizeUnitAlias("kilograms")).toBe("kg");
		expect(normalizeUnitAlias("ounces")).toBe("oz");
		expect(normalizeUnitAlias("pounds")).toBe("lb");
		expect(normalizeUnitAlias("cups")).toBe("cup");
		expect(normalizeUnitAlias("pieces")).toBe("piece");
	});

	it("resolves long-form aliases", () => {
		expect(normalizeUnitAlias("tablespoon")).toBe("tbsp");
		expect(normalizeUnitAlias("tablespoons")).toBe("tbsp");
		expect(normalizeUnitAlias("teaspoon")).toBe("tsp");
		expect(normalizeUnitAlias("teaspoons")).toBe("tsp");
		expect(normalizeUnitAlias("liter")).toBe("l");
		expect(normalizeUnitAlias("litre")).toBe("l");
		expect(normalizeUnitAlias("milliliter")).toBe("ml");
		expect(normalizeUnitAlias("fluid ounce")).toBe("fl oz");
		expect(normalizeUnitAlias("fluid ounces")).toBe("fl oz");
	});

	it("handles case-insensitive input", () => {
		expect(normalizeUnitAlias("GRAMS")).toBe("g");
		expect(normalizeUnitAlias("Tablespoons")).toBe("tbsp");
	});

	it("falls back to toSupportedUnit for unrecognised aliases", () => {
		expect(normalizeUnitAlias("stone")).toBe("unit");
		expect(normalizeUnitAlias(null)).toBe("unit");
	});
});

describe("areSameFamily", () => {
	it("returns true for same weight family", () => {
		expect(areSameFamily("g", "kg")).toBe(true);
	});

	it("returns true for same volume family", () => {
		expect(areSameFamily("ml", "l")).toBe(true);
		expect(areSameFamily("cup", "tsp")).toBe(true);
	});

	it("returns false across families", () => {
		expect(areSameFamily("g", "ml")).toBe(false);
		expect(areSameFamily("kg", "cup")).toBe(false);
		expect(areSameFamily("g", "unit")).toBe(false);
	});

	it("returns false for metric vs imperial weight", () => {
		expect(areSameFamily("g", "oz")).toBe(false);
		expect(areSameFamily("kg", "lb")).toBe(false);
	});
});

describe("convertQuantity", () => {
	it("converts within weight metric family", () => {
		expect(convertQuantity(1, "kg", "g")).toBe(1000);
		expect(convertQuantity(500, "g", "kg")).toBe(0.5);
	});

	it("converts within volume family", () => {
		expect(convertQuantity(1, "l", "ml")).toBe(1000);
		expect(convertQuantity(1, "cup", "ml")).toBeCloseTo(236.588);
		expect(convertQuantity(3, "tsp", "tbsp")).toBeCloseTo(1, 1);
	});

	it("returns null for cross-family conversion", () => {
		expect(convertQuantity(100, "g", "ml")).toBeNull();
		expect(convertQuantity(1, "cup", "g")).toBeNull();
		expect(convertQuantity(1, "unit", "g")).toBeNull();
	});

	it("bridges metric and imperial weight", () => {
		expect(convertQuantity(1000, "g", "oz")).toBeCloseTo(35.274, 2);
		expect(convertQuantity(1, "lb", "g")).toBeCloseTo(453.592, 2);
		expect(getUnitMultiplier("g", "oz")).toBeCloseTo(0.03527, 5);
	});

	it("same unit returns multiplier of 1", () => {
		expect(convertQuantity(5, "g", "g")).toBe(5);
		expect(convertQuantity(2, "cup", "cup")).toBe(2);
	});
});

describe("convertQuantityWithDensity", () => {
	const waterDensity = 1.0; // g/ml

	it("converts weight to volume using density (g -> ml)", () => {
		expect(
			convertQuantityWithDensity(100, "g", "ml", waterDensity),
		).toBeCloseTo(100);
	});

	it("converts weight to volume (g -> cup)", () => {
		expect(
			convertQuantityWithDensity(236.588, "g", "cup", waterDensity),
		).toBeCloseTo(1, 2);
	});

	it("converts volume to weight (ml -> g)", () => {
		expect(
			convertQuantityWithDensity(100, "ml", "g", waterDensity),
		).toBeCloseTo(100);
	});

	it("converts volume to weight (cup -> kg)", () => {
		expect(
			convertQuantityWithDensity(1, "cup", "kg", waterDensity),
		).toBeCloseTo(0.237, 2);
	});

	it("returns null for same-family conversion", () => {
		expect(convertQuantityWithDensity(100, "g", "kg", waterDensity)).toBeNull();
		expect(convertQuantityWithDensity(100, "ml", "l", waterDensity)).toBeNull();
	});

	it("returns null for zero or negative density", () => {
		expect(convertQuantityWithDensity(100, "g", "ml", 0)).toBeNull();
		expect(convertQuantityWithDensity(100, "g", "ml", -1)).toBeNull();
	});

	it("returns null for non-finite density", () => {
		expect(
			convertQuantityWithDensity(100, "g", "ml", Number.POSITIVE_INFINITY),
		).toBeNull();
		expect(convertQuantityWithDensity(100, "g", "ml", Number.NaN)).toBeNull();
	});

	it("uses density for heavier ingredients (flour ~0.53 g/ml)", () => {
		const flourDensity = 0.53;
		// 1 cup of flour (236.588 ml) * 0.53 g/ml ≈ 125g
		const grams = convertQuantityWithDensity(1, "cup", "g", flourDensity);
		expect(grams).toBeCloseTo(125.4, 0);
	});
});

/**
 * Tests for the canonical conversion function. Every conversion path in the
 * app — matching, supply sync, cook deduction — must go through this function.
 * These tests define the contract that all consumers must satisfy.
 */
describe("convertIngredientAmount — canonical ingredient conversion", () => {
	// ── same-family (no density needed) ──────────────────────────────────────
	it("converts within weight family (g → kg)", () => {
		expect(convertIngredientAmount(1000, "g", "kg")).toBe(1);
	});

	it("converts within volume family (cup → ml)", () => {
		expect(convertIngredientAmount(1, "cup", "ml")).toBeCloseTo(236.588, 2);
	});

	it("bridges metric and imperial weight (g → oz)", () => {
		expect(convertIngredientAmount(1000, "g", "oz")).toBeCloseTo(35.274, 2);
	});

	it("returns 1:1 for same unit", () => {
		expect(convertIngredientAmount(5, "g", "g")).toBe(5);
	});

	// ── cross-family with known density ──────────────────────────────────────
	it("converts g rice → cups using density (the primary bug scenario)", () => {
		// rice density = 0.85 g/ml; 1 cup = 236.588 ml
		// 500 g rice / 0.85 g/ml = 588.2 ml = 588.2 / 236.588 ≈ 2.49 cups
		const cups = convertIngredientAmount(500, "g", "cup", "rice");
		expect(cups).not.toBeNull();
		expect(cups as number).toBeCloseTo(2.49, 1);
	});

	it("converts 1 cup rice → grams using density (cook deduction amount)", () => {
		// 1 cup = 236.588 ml * 0.85 g/ml ≈ 201 g
		const grams = convertIngredientAmount(1, "cup", "g", "rice");
		expect(grams).not.toBeNull();
		expect(grams as number).toBeCloseTo(201, 0);
	});

	it("converts cup flour → grams using density", () => {
		// flour density = 0.53 g/ml; 1 cup = 236.588 ml * 0.53 ≈ 125 g
		const grams = convertIngredientAmount(1, "cup", "g", "flour");
		expect(grams).not.toBeNull();
		expect(grams as number).toBeCloseTo(125, 0);
	});

	it("converts grams flour → cups using density (reverse)", () => {
		// 125 g / 0.53 g/ml / 236.588 ml/cup ≈ 1 cup
		const cups = convertIngredientAmount(125, "g", "cup", "flour");
		expect(cups).not.toBeNull();
		expect(cups as number).toBeCloseTo(1.0, 1);
	});

	it("cross-family forward and back are symmetric within rounding tolerance", () => {
		// 500 g rice → cups → back to grams should be ~500 g
		const cups = convertIngredientAmount(500, "g", "cup", "rice") as number;
		const backToGrams = convertIngredientAmount(
			cups,
			"cup",
			"g",
			"rice",
		) as number;
		expect(backToGrams).toBeCloseTo(500, 0);
	});

	// ── cross-family without density → null ──────────────────────────────────
	it("returns null for cross-family with no ingredient name", () => {
		expect(convertIngredientAmount(100, "g", "cup")).toBeNull();
		expect(convertIngredientAmount(1, "cup", "g")).toBeNull();
	});

	it("returns null when ingredient has no known density", () => {
		expect(convertIngredientAmount(100, "g", "cup", "unobtainium")).toBeNull();
	});

	it("returns null for incompatible families (weight → count)", () => {
		expect(convertIngredientAmount(100, "g", "unit", "rice")).toBeNull();
	});

	// ── ingredient name aliases are resolved ─────────────────────────────────
	it("resolves ingredient name aliases for density (white rice = rice)", () => {
		const cupsFromWhiteRice = convertIngredientAmount(
			500,
			"g",
			"cup",
			"white rice",
		);
		const cupsFromRice = convertIngredientAmount(500, "g", "cup", "rice");
		expect(cupsFromWhiteRice).not.toBeNull();
		expect(cupsFromWhiteRice).toBeCloseTo(cupsFromRice as number, 4);
	});
});

describe("normalizeToBaseUnit", () => {
	it("converts kg to base (g)", () => {
		const result = normalizeToBaseUnit(2, "kg");
		expect(result.quantity).toBe(2000);
		expect(result.unit).toBe("g");
		expect(result.family).toBe("weight_metric");
	});

	it("converts cup to base (ml)", () => {
		const result = normalizeToBaseUnit(1, "cup");
		expect(result.quantity).toBeCloseTo(236.588);
		expect(result.unit).toBe("ml");
	});

	it("keeps g as-is (already base)", () => {
		const result = normalizeToBaseUnit(100, "g");
		expect(result.quantity).toBe(100);
		expect(result.unit).toBe("g");
	});
});

describe("chooseReadableUnit", () => {
	it("promotes g to kg at >= 1000g", () => {
		const result = chooseReadableUnit(1000, "g");
		expect(result.unit).toBe("kg");
		expect(result.quantity).toBe(1);
	});

	it("keeps g below 1000g", () => {
		const result = chooseReadableUnit(500, "g");
		expect(result.unit).toBe("g");
		expect(result.quantity).toBe(500);
	});

	it("promotes oz to lb at >= 16oz", () => {
		const result = chooseReadableUnit(32, "oz");
		expect(result.unit).toBe("lb");
		expect(result.quantity).toBe(2);
	});

	it("promotes ml to tsp at >= 4.92892 ml", () => {
		const result = chooseReadableUnit(5, "ml");
		expect(result.unit).toBe("tsp");
	});

	it("promotes ml to tbsp at >= 14.7868 ml", () => {
		const result = chooseReadableUnit(15, "ml");
		expect(result.unit).toBe("tbsp");
	});

	it("promotes ml to cup at >= 236.588 ml", () => {
		const result = chooseReadableUnit(250, "ml");
		expect(result.unit).toBe("cup");
	});

	it("promotes ml to gal at >= 3785.41 ml", () => {
		const result = chooseReadableUnit(4000, "ml");
		expect(result.unit).toBe("gal");
	});
});

describe("shopping/cooking presentation conversion", () => {
	it("converts volume solids to metric shopping units", () => {
		// 1 cup rice (~0.85 g/ml) ≈ 201 g
		const result = toShoppingUnit(1, "cup", "rice", "metric");
		expect(result.unit).toBe("g");
		expect(result.quantity).toBeCloseTo(201, 0);
	});

	it("keeps liquids in metric volume for shopping mode", () => {
		const result = toShoppingUnit(1, "cup", "milk", "metric");
		expect(result.unit).toBe("ml");
		expect(result.quantity).toBeCloseTo(236.588, 2);
	});

	it("can convert weight solids back to cooking units", () => {
		const result = toCookingUnit(201, "g", "rice");
		expect(["fl oz", "cup"]).toContain(result.unit);
		const asCups = convertQuantity(result.quantity, result.unit, "cup");
		expect(asCups).not.toBeNull();
		expect(asCups ?? 0).toBeCloseTo(1, 1);
	});
});
