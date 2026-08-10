import type { NullableNutrientValues } from "./types";

/**
 * Atwater-implied energy (kcal) from macros: protein×4 + carbs×4 + fat×9.
 * Null macros count as 0.
 */
export function atwaterKcalFromMacros(values: {
	proteinG: number | null | undefined;
	fatG: number | null | undefined;
	carbG: number | null | undefined;
}): number {
	const protein = values.proteinG ?? 0;
	const fat = values.fatG ?? 0;
	const carb = values.carbG ?? 0;
	return protein * 4 + carb * 4 + fat * 9;
}

/** Noise floor: Atwater energy below this with stated 0 kcal is tolerated. */
export const USDA_ATWATER_ZERO_ENERGY_THRESHOLD_KCAL = 5;

function isNullOrZero(value: number | null | undefined): boolean {
	return value == null || value === 0;
}

/**
 * Whether a hydrated USDA nutrient profile is usable for cargo ingest.
 *
 * Incomplete or physically inconsistent energy counts as a resolve miss so
 * scan review can fall through to AI estimate (or blank).
 *
 * Unusable when:
 * 1. energyKcal is null (unknown — not assumed zero)
 * 2. energyKcal === 0 and macros imply ≥ {@link USDA_ATWATER_ZERO_ENERGY_THRESHOLD_KCAL}
 * 3. energyKcal === 0 and protein/fat/carb are all null or 0 (empty core profile)
 */
export function isUsdaNutrientProfileUsable(
	nutrients: NullableNutrientValues,
): boolean {
	const energy = nutrients.energyKcal;
	if (energy == null) return false;
	if (!Number.isFinite(energy)) return false;

	if (energy === 0) {
		const implied = atwaterKcalFromMacros(nutrients);
		if (implied >= USDA_ATWATER_ZERO_ENERGY_THRESHOLD_KCAL) return false;
		if (
			isNullOrZero(nutrients.proteinG) &&
			isNullOrZero(nutrients.fatG) &&
			isNullOrZero(nutrients.carbG)
		) {
			return false;
		}
	}

	return true;
}
