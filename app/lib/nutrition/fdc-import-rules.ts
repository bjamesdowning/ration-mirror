/**
 * Pure USDA FoodData Central import rules (energy precedence, salt derivation).
 * Used by scripts/import-fdc-nutrition.ts and unit tests.
 */

export const SALT_DERIVATION_SODIUM_2_5 = "ration_sodium_to_salt_2_5" as const;

export type ImportWideNutrients = {
	energy_kcal: number | null;
	protein_g: number | null;
	fat_g: number | null;
	carb_g: number | null;
	fiber_g: number | null;
	sugar_g: number | null;
	sat_fat_g: number | null;
	sodium_mg: number | null;
	salt_g: number | null;
	energy_nutrient_id: number | null;
	sugar_nutrient_id: number | null;
	salt_derivation: typeof SALT_DERIVATION_SODIUM_2_5 | null;
};

export function emptyImportNutrients(): ImportWideNutrients {
	return {
		energy_kcal: null,
		protein_g: null,
		fat_g: null,
		carb_g: null,
		fiber_g: null,
		sugar_g: null,
		sat_fat_g: null,
		sodium_mg: null,
		salt_g: null,
		energy_nutrient_id: null,
		sugar_nutrient_id: null,
		salt_derivation: null,
	};
}

/** Foundation: 2048 → 2047 → 1008. SR Legacy: 1008 first. */
export function energyNutrientPriority(dataType: string): number[] {
	if (dataType === "foundation_food" || dataType === "foundation") {
		return [2048, 2047, 1008];
	}
	return [1008, 2047, 2048];
}

const MACRO_COLUMNS: Record<
	number,
	keyof Pick<
		ImportWideNutrients,
		"protein_g" | "fat_g" | "carb_g" | "fiber_g" | "sat_fat_g" | "sodium_mg"
	>
> = {
	1003: "protein_g",
	1004: "fat_g",
	1005: "carb_g",
	1079: "fiber_g",
	1258: "sat_fat_g",
	1093: "sodium_mg",
};

/**
 * Apply one FDC nutrient amount. Null stays distinct from zero.
 * Physiologically impossible / non-finite values are rejected.
 */
export function applyImportNutrient(
	target: ImportWideNutrients,
	nutrientId: number,
	amount: number,
	dataType: string,
): void {
	if (!Number.isFinite(amount)) return;
	// Reject absurd energy / macro amounts (per 100g).
	if (nutrientId === 1008 || nutrientId === 2047 || nutrientId === 2048) {
		if (amount < 0 || amount > 950) return;
		const order = energyNutrientPriority(dataType);
		const newPri = order.indexOf(nutrientId);
		if (newPri < 0) return;
		const currentPri =
			target.energy_nutrient_id == null
				? Number.POSITIVE_INFINITY
				: order.indexOf(target.energy_nutrient_id);
		if (target.energy_kcal == null || newPri < currentPri) {
			target.energy_kcal = amount;
			target.energy_nutrient_id = nutrientId;
		}
		return;
	}

	// Sugar: prefer Total Sugars (2000); do not overwrite with 1063.
	if (nutrientId === 2000) {
		if (amount < 0 || amount > 100) return;
		target.sugar_g = amount;
		target.sugar_nutrient_id = 2000;
		return;
	}
	if (nutrientId === 1063) {
		if (amount < 0 || amount > 100) return;
		if (target.sugar_g == null) {
			target.sugar_g = amount;
			target.sugar_nutrient_id = 1063;
		}
		return;
	}

	const col = MACRO_COLUMNS[nutrientId];
	if (!col) return;
	if (amount < 0 || amount > 1000) return;
	if (target[col] == null) {
		target[col] = amount;
	}
}

/** Derive salt from sodium with explicit Ration derivation marker. */
export function finalizeImportSalt(target: ImportWideNutrients): void {
	if (target.sodium_mg != null && Number.isFinite(target.sodium_mg)) {
		target.salt_g = (target.sodium_mg * 2.5) / 1000;
		target.salt_derivation = SALT_DERIVATION_SODIUM_2_5;
	}
}
