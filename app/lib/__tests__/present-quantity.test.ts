import { describe, expect, it } from "vitest";
import goldenCases from "~/lib/__fixtures__/quantity-presentation.json";
import {
	decomposeSubUnits,
	formatQuantity,
	snapEpsilon,
} from "~/lib/format-quantity";
import {
	areIngredientUnitsCompatible,
	convertForIngredient,
	presentQuantity,
} from "~/lib/present-quantity";
import type { UnitDisplayMode } from "~/lib/unit-display-mode";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";

describe("snapEpsilon", () => {
	it("snaps float artifacts to integers", () => {
		expect(snapEpsilon(1.0000000000243)).toBe(1);
		expect(snapEpsilon(2.9999999999)).toBe(3);
	});
});

describe("decomposeSubUnits", () => {
	it("decomposes 17 tbsp into 1 cup + 1 tbsp", () => {
		const result = decomposeSubUnits(17, "tbsp");
		expect(result).toContain("cup");
		expect(result).toContain("tbsp");
	});

	it("decomposes 5 tsp into 1 tbsp + 2 tsp", () => {
		const result = decomposeSubUnits(5, "tsp");
		expect(result).toContain("tbsp");
		expect(result).toContain("tsp");
	});
});

describe("formatQuantity float edges", () => {
	it("formats 1.0000000000243 oz without float artifacts", () => {
		expect(formatQuantity(1.0000000000243, "oz")).toBe("1 oz");
	});
});

describe("presentQuantity", () => {
	it("returns original units in original mode", () => {
		const result = presentQuantity({
			quantity: 2,
			unit: "cup",
			ingredientName: "flour",
			mode: "original",
		});
		expect(result.formatted).toBe("2 cup");
		expect(result.confidence).toBe("exact");
	});

	it("prefixes approximate density conversions in cooking mode", () => {
		const result = presentQuantity({
			quantity: 500,
			unit: "g",
			ingredientName: "all purpose flour",
			mode: "cooking",
		});
		expect(result.formatted.startsWith("≈")).toBe(true);
		expect(result.usedDensity).toBe(true);
	});

	it("converts grams to readable metric weight for shopping", () => {
		const result = presentQuantity({
			quantity: 1500,
			unit: "g",
			ingredientName: "rice",
			mode: "metric",
		});
		expect(result.unit).toBe("kg");
		expect(result.quantity).toBe(1.5);
	});

	it("keeps metric liquids on l/ml (not US qt/pt)", () => {
		const liter = presentQuantity({
			quantity: 1000,
			unit: "ml",
			ingredientName: "milk",
			mode: "metric",
		});
		expect(liter.unit).toBe("l");
		expect(liter.quantity).toBe(1);

		const halfLiter = presentQuantity({
			quantity: 500,
			unit: "ml",
			ingredientName: "olive oil",
			mode: "metric",
		});
		expect(halfLiter.unit).toBe("ml");
		expect(halfLiter.quantity).toBe(500);
	});

	it("converts metric weights to imperial lb/oz in imperial mode", () => {
		const flour = presentQuantity({
			quantity: 1000,
			unit: "g",
			ingredientName: "flour",
			mode: "imperial",
		});
		expect(flour.unit).toBe("lb");
		expect(flour.quantity).toBeCloseTo(2.20462, 2);

		const butter = presentQuantity({
			quantity: 500,
			unit: "g",
			ingredientName: "butter",
			mode: "imperial",
		});
		expect(butter.unit).toBe("lb");
		expect(butter.quantity).toBeCloseTo(1.102, 2);
	});

	it("uses US volume ladder for liquids in imperial mode", () => {
		const milk = presentQuantity({
			quantity: 2000,
			unit: "ml",
			ingredientName: "milk",
			mode: "imperial",
		});
		expect(milk.unit).toBe("qt");
		expect(milk.quantity).toBeCloseTo(2.113, 2);
	});

	it("preserves authored units in original mode", () => {
		const result = presentQuantity({
			quantity: 1,
			unit: "kg",
			ingredientName: "flour",
			mode: "original",
		});
		expect(result.unit).toBe("kg");
		expect(result.quantity).toBe(1);
	});

	it("matches shared golden fixtures", () => {
		for (const c of goldenCases) {
			const result = presentQuantity({
				quantity: c.quantity,
				unit: c.unit,
				ingredientName: c.ingredientName,
				mode: c.mode as UnitDisplayMode,
			});
			expect(result.unit, c.id).toBe(c.expectedUnit);
			if ("expectedQuantity" in c && c.expectedQuantity != null) {
				expect(result.quantity, c.id).toBe(c.expectedQuantity);
			}
			if ("expectedQuantityApprox" in c && c.expectedQuantityApprox != null) {
				expect(result.quantity, c.id).toBeCloseTo(c.expectedQuantityApprox, 2);
			}
		}
	});
});

describe("areIngredientUnitsCompatible", () => {
	it("allows flour grams and cups to merge", () => {
		expect(areIngredientUnitsCompatible("g", "cup", "all purpose flour")).toBe(
			true,
		);
	});

	it("rejects incompatible families without density", () => {
		expect(areIngredientUnitsCompatible("g", "unit", "mystery item")).toBe(
			false,
		);
	});
});

describe("convertForIngredient", () => {
	it("converts 500g flour to approximately 4 cups", () => {
		const cups = convertForIngredient(500, "g", "cup", "all purpose flour");
		expect(cups).not.toBeNull();
		expect(cups ?? 0).toBeGreaterThan(3.5);
		expect(cups ?? 0).toBeLessThan(4.5);
	});
});

describe("resolveUnitDisplayMode", () => {
	it("prefers unitDisplayMode over legacy supplyUnitMode", () => {
		expect(
			resolveUnitDisplayMode({
				unitDisplayMode: "original",
				supplyUnitMode: "imperial",
			}),
		).toBe("original");
	});

	it("falls back to supplyUnitMode when unitDisplayMode is unset", () => {
		expect(resolveUnitDisplayMode({ supplyUnitMode: "cooking" })).toBe(
			"cooking",
		);
	});

	it("defaults to metric", () => {
		expect(resolveUnitDisplayMode({})).toBe("metric");
	});
});
