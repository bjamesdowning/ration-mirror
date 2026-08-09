import { describe, expect, it } from "vitest";
import {
	applyImportNutrient,
	emptyImportNutrients,
	energyNutrientPriority,
	finalizeImportSalt,
	SALT_DERIVATION_SODIUM_2_5,
} from "../fdc-import-rules";
import { rowToNutrients } from "../resolve-food.server";

describe("energyNutrientPriority", () => {
	it("prefers Atwater for foundation foods", () => {
		expect(energyNutrientPriority("foundation_food")).toEqual([
			2048, 2047, 1008,
		]);
	});

	it("prefers 1008 for SR Legacy", () => {
		expect(energyNutrientPriority("sr_legacy_food")[0]).toBe(1008);
	});
});

describe("applyImportNutrient", () => {
	it("applies Foundation energy precedence 2048 > 2047 > 1008", () => {
		const n = emptyImportNutrients();
		applyImportNutrient(n, 1008, 100, "foundation_food");
		applyImportNutrient(n, 2047, 110, "foundation_food");
		applyImportNutrient(n, 2048, 120, "foundation_food");
		expect(n.energy_kcal).toBe(120);
		expect(n.energy_nutrient_id).toBe(2048);
	});

	it("keeps SR Legacy 1008 over later Atwater ids", () => {
		const n = emptyImportNutrients();
		applyImportNutrient(n, 1008, 100, "sr_legacy_food");
		applyImportNutrient(n, 2048, 200, "sr_legacy_food");
		expect(n.energy_kcal).toBe(100);
		expect(n.energy_nutrient_id).toBe(1008);
	});

	it("preserves null separately from zero", () => {
		const n = emptyImportNutrients();
		applyImportNutrient(n, 1003, 0, "sr_legacy_food");
		expect(n.protein_g).toBe(0);
		expect(n.fat_g).toBeNull();
	});

	it("does not overwrite total sugars (2000) with 1063", () => {
		const n = emptyImportNutrients();
		applyImportNutrient(n, 2000, 5, "sr_legacy_food");
		applyImportNutrient(n, 1063, 9, "sr_legacy_food");
		expect(n.sugar_g).toBe(5);
		expect(n.sugar_nutrient_id).toBe(2000);
	});
});

describe("finalizeImportSalt", () => {
	it("derives salt with explicit Ration marker", () => {
		const n = emptyImportNutrients();
		n.sodium_mg = 400;
		finalizeImportSalt(n);
		expect(n.salt_g).toBeCloseTo(1, 5);
		expect(n.salt_derivation).toBe(SALT_DERIVATION_SODIUM_2_5);
	});
});

describe("rowToNutrients", () => {
	it("does not coerce null core macros to zero", () => {
		const nutrients = rowToNutrients({
			energy_kcal: null,
			protein_g: 10,
			fat_g: null,
			carb_g: 0,
			fiber_g: null,
			sugar_g: null,
			sat_fat_g: null,
			sodium_mg: null,
			salt_g: null,
		});
		expect(nutrients.energyKcal).toBeNull();
		expect(nutrients.proteinG).toBe(10);
		expect(nutrients.fatG).toBeNull();
		expect(nutrients.carbG).toBe(0);
	});
});
