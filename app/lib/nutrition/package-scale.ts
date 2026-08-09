import {
	convertQuantity,
	getUnitFamily,
	type SupportedUnit,
} from "~/lib/units";
import {
	nutrientsPer100gFromPackageTotals,
	withDerivedPer100g,
} from "./override-scale";
import {
	convertIngredientAmountToGrams,
	scaleNutrientsPer100g,
} from "./scale-nutrients";
import type { NutritionSnapshot } from "./types";

export type ScaleCargoNutritionOptions = {
	/** Prior package size — used to backfill density from package totals. */
	previousQuantity?: number | null;
	previousUnit?: SupportedUnit | null;
};

/**
 * Package mass for nutrition scaling. Prefers density-aware conversion; for
 * volume units with unknown density (common OCR/USDA names), assumes 1 g/ml
 * so liter/ml edits still rescale package totals.
 *
 * Compatibility only: this fallback is unlabelled. A later quality-aware mass
 * resolver will return method/confidence (`assumed_1g_ml` / estimated) so UI
 * and snapshots can show estimated weight instead of treating it as exact.
 */
export function gramsForNutritionPackage(
	quantity: number | null | undefined,
	unit: SupportedUnit | null | undefined,
	name: string,
): number | null {
	if (quantity == null || unit == null) return null;
	if (!Number.isFinite(quantity) || quantity <= 0) return null;

	const dense = convertIngredientAmountToGrams(quantity, unit, name);
	if (dense != null && dense > 0) return dense;

	if (getUnitFamily(unit) === "volume") {
		const ml = convertQuantity(quantity, unit, "ml");
		if (ml != null && Number.isFinite(ml) && ml > 0) {
			return ml; // temporary unlabelled 1 g/ml fallback
		}
	}

	return null;
}

/**
 * Align cargo nutrition package totals (`perServing`) with the current qty/unit.
 *
 * - USDA / AI: density (`per100g`) is authoritative; recompute package totals.
 * - User override: package totals are authoritative; derive density from the
 *   previous package when possible, otherwise keep totals and backfill density
 *   for the new size (e.g. correcting "1 unit" → "1 L" after typing kcal).
 *
 * Pure / isomorphic — safe for Cargo edit and scan review clients.
 */
export function scaleCargoNutritionToPackage(
	snapshot: NutritionSnapshot,
	quantity: number | null | undefined,
	unit: SupportedUnit | null | undefined,
	name: string,
	opts?: ScaleCargoNutritionOptions,
): NutritionSnapshot {
	const newGrams = gramsForNutritionPackage(quantity, unit, name);

	const previousQuantity = opts?.previousQuantity;
	const previousUnit = opts?.previousUnit;
	const oldGrams = gramsForNutritionPackage(
		previousQuantity,
		previousUnit ?? null,
		name,
	);

	const isOverride = snapshot.source === "user_override";

	if (isOverride && snapshot.perServing) {
		if (oldGrams != null && oldGrams > 0) {
			const per100g = nutrientsPer100gFromPackageTotals(
				snapshot.perServing,
				oldGrams,
			);
			if (per100g && newGrams != null && newGrams > 0) {
				return {
					...snapshot,
					per100g,
					perServing: scaleNutrientsPer100g(per100g, newGrams),
				};
			}
			if (per100g) {
				return {
					...snapshot,
					per100g,
					perServing:
						newGrams != null && newGrams > 0
							? scaleNutrientsPer100g(per100g, newGrams)
							: null,
				};
			}
		}
		if (newGrams != null && newGrams > 0) {
			// Correcting package size without a prior mass — keep absolute totals.
			return withDerivedPer100g(
				{ ...snapshot, per100g: null },
				quantity,
				unit,
				name,
			);
		}
		return snapshot;
	}

	const per100g = snapshot.per100g;
	if (per100g && newGrams != null && newGrams > 0) {
		return {
			...snapshot,
			per100g,
			perServing: scaleNutrientsPer100g(per100g, newGrams),
		};
	}

	if (per100g && (newGrams == null || newGrams <= 0)) {
		return {
			...snapshot,
			per100g,
			perServing: null,
		};
	}

	return snapshot;
}

/**
 * True when quantity or unit actually changed enough to warrant rescale.
 */
export function cargoPackageSizeChanged(
	prevQuantity: number,
	prevUnit: string,
	nextQuantity: number,
	nextUnit: string,
): boolean {
	return prevQuantity !== nextQuantity || prevUnit !== nextUnit;
}
