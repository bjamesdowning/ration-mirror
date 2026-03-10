/**
 * Cross-surface ingredient conversion contract tests.
 *
 * These tests assert that the matching, supply, and cook deduction surfaces all
 * produce identical results for the same input scenarios. Any divergence
 * indicates that a code path has bypassed the canonical convertIngredientAmount
 * helper and must be corrected.
 *
 * Key scenarios covered:
 *  - 500 g cargo rice vs 1 cup recipe rice (the regression case from the bug report)
 *  - kg cargo vs cup recipe
 *  - Same-family conversions still work
 *  - Unknown density cross-family returns null consistently
 */
import { describe, expect, it } from "vitest";
import { lookupDensity } from "~/lib/ingredient-density";
import { sumConvertedToTarget } from "~/lib/matching.server";
import { convertIngredientAmount, toSupportedUnit } from "~/lib/units";

// ── Helpers to simulate the three consumer surfaces without DB ────────────────

/**
 * Simulates what sumConvertedToTarget (matching path) returns for a single
 * cargo item against a recipe's required unit.
 */
function matchingAvailableQty(
	cargoQuantity: number,
	cargoUnit: string,
	recipeUnit: string,
	ingredientName: string,
): number {
	const fakeBucket = [
		{
			original: {
				id: "test-id",
				name: ingredientName,
				unit: cargoUnit,
				quantity: cargoQuantity,
				domain: "food",
			},
			totalQuantity: cargoQuantity,
			normalizedName: ingredientName,
		},
	];
	return sumConvertedToTarget(
		fakeBucket,
		toSupportedUnit(recipeUnit),
		ingredientName,
	);
}

/**
 * Simulates what the cook deduction path converts: recipe qty in recipe unit
 * → cargo unit, for linked ingredient deduction.
 */
function cookDeductionAmount(
	recipeQty: number,
	recipeUnit: string,
	cargoUnit: string,
	ingredientName: string,
): number | null {
	return convertIngredientAmount(
		recipeQty,
		toSupportedUnit(recipeUnit),
		toSupportedUnit(cargoUnit),
		ingredientName,
	);
}

// ── Contract tests ─────────────────────────────────────────────────────────────

describe("cross-surface contract — 500 g cargo vs 1 cup recipe (rice regression)", () => {
	const ingredientName = "rice";
	const cargoQty = 500;
	const cargoUnit = "g";
	const recipeQty = 1;
	const recipeUnit = "cup";

	it("matching surface: cargo of 500g satisfies requirement of 1 cup", () => {
		const available = matchingAvailableQty(
			cargoQty,
			cargoUnit,
			recipeUnit,
			ingredientName,
		);
		expect(available).toBeGreaterThanOrEqual(recipeQty);
	});

	it("cook deduction surface: 1 cup rice converts to a positive gram amount", () => {
		const grams = cookDeductionAmount(
			recipeQty,
			recipeUnit,
			cargoUnit,
			ingredientName,
		);
		expect(grams).not.toBeNull();
		expect(grams as number).toBeGreaterThan(0);
	});

	it("cook deduction surface: deducted grams do not exceed cargo quantity", () => {
		const grams = cookDeductionAmount(
			recipeQty,
			recipeUnit,
			cargoUnit,
			ingredientName,
		) as number;
		expect(grams).toBeLessThanOrEqual(cargoQty);
	});

	it("matching and cook agree on convertibility for same ingredient pair", () => {
		const matchAvailable = matchingAvailableQty(
			cargoQty,
			cargoUnit,
			recipeUnit,
			ingredientName,
		);
		const cookDeduct = cookDeductionAmount(
			recipeQty,
			recipeUnit,
			cargoUnit,
			ingredientName,
		);
		// Both must succeed (non-null / non-zero) or both must fail
		expect(matchAvailable > 0).toBe(cookDeduct !== null && cookDeduct > 0);
	});

	it("canonical helper is consistent with matching result (round-trip symmetry)", () => {
		// convertIngredientAmount(500 g → cups) should equal matchingAvailableQty
		const canonical = convertIngredientAmount(
			cargoQty,
			toSupportedUnit(cargoUnit),
			toSupportedUnit(recipeUnit),
			ingredientName,
		) as number;
		const fromMatching = matchingAvailableQty(
			cargoQty,
			cargoUnit,
			recipeUnit,
			ingredientName,
		);
		expect(canonical).toBeCloseTo(fromMatching, 6);
	});
});

describe("cross-surface contract — kg cargo vs cup recipe (flour)", () => {
	const ingredientName = "flour";
	// 1 kg flour; recipe needs 2 cups flour (≈ 250 g each)
	const cargoQty = 1; // 1 kg
	const cargoUnit = "kg";
	const recipeQty = 2; // 2 cups
	const recipeUnit = "cup";

	it("matching: 1 kg flour satisfies 2 cups", () => {
		const available = matchingAvailableQty(
			cargoQty,
			cargoUnit,
			recipeUnit,
			ingredientName,
		);
		expect(available).toBeGreaterThanOrEqual(recipeQty);
	});

	it("cook deduction: 2 cups flour → positive kg amount", () => {
		const kg = cookDeductionAmount(
			recipeQty,
			recipeUnit,
			cargoUnit,
			ingredientName,
		);
		expect(kg).not.toBeNull();
		expect(kg as number).toBeGreaterThan(0);
		expect(kg as number).toBeLessThanOrEqual(cargoQty);
	});
});

describe("cross-surface contract — same-family conversion (no density required)", () => {
	it("matching: 500 g cargo satisfies 400 g recipe", () => {
		const available = matchingAvailableQty(500, "g", "g", "any_item");
		expect(available).toBeGreaterThanOrEqual(400);
	});

	it("matching: 1 kg cargo satisfies 800 g recipe via unit conversion", () => {
		const available = matchingAvailableQty(1, "kg", "g", "any_item");
		expect(available).toBeCloseTo(1000, 2);
		expect(available).toBeGreaterThanOrEqual(800);
	});

	it("cook deduction: 400 g recipe vs 500 g cargo — deducts correct amount", () => {
		const deduct = cookDeductionAmount(400, "g", "g", "any_item");
		expect(deduct).toBe(400);
	});
});

describe("cross-surface contract — unknown density fails consistently", () => {
	const ingredientName = "unobtainium";

	it("matching returns 0 for cross-family with no density", () => {
		const available = matchingAvailableQty(500, "g", "cup", ingredientName);
		expect(available).toBe(0);
	});

	it("cook deduction returns null for cross-family with no density", () => {
		const deduct = cookDeductionAmount(1, "cup", "g", ingredientName);
		expect(deduct).toBeNull();
	});

	it("both surfaces agree that conversion is impossible", () => {
		const matchAvailable = matchingAvailableQty(
			500,
			"g",
			"cup",
			ingredientName,
		);
		const cookDeduct = cookDeductionAmount(1, "cup", "g", ingredientName);
		// match returns 0, cook returns null — both signal "not convertible"
		expect(matchAvailable).toBe(0);
		expect(cookDeduct).toBeNull();
	});
});

describe("cross-surface contract — density lookup consistency", () => {
	it("lookupDensity for rice returns a positive number", () => {
		const d = lookupDensity("rice");
		expect(d).not.toBeNull();
		expect(d as number).toBeGreaterThan(0);
	});

	it("density aliases resolve identically (white rice = rice)", () => {
		expect(lookupDensity("white rice")).toBe(lookupDensity("rice"));
	});

	it("conversion result is deterministic across repeated calls", () => {
		const a = convertIngredientAmount(500, "g", "cup", "rice");
		const b = convertIngredientAmount(500, "g", "cup", "rice");
		expect(a).toBe(b);
	});
});
