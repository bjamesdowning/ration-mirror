import type { SupportedUnit } from "~/lib/units";
import { gramsFromMassResolution } from "./mass-resolution";
import {
	nutrientsPer100gFromPackageTotals,
	withDerivedPer100g,
} from "./override-scale";
import { scaleNutrientsPer100g } from "./scale-nutrients";
import type { NutritionSnapshot } from "./types";

export type ScaleCargoNutritionOptions = {
	/** Prior package size — used to backfill density from package totals. */
	previousQuantity?: number | null;
	previousUnit?: SupportedUnit | null;
};

/**
 * Package mass for nutrition scaling. Delegates to quality-aware mass resolver.
 * Volume units with unknown density use 1 g/ml (`assumed_1g_ml`) so liter/ml edits
 * still rescale package totals.
 */
export function gramsForNutritionPackage(
	quantity: number | null | undefined,
	unit: SupportedUnit | null | undefined,
	name: string,
): number | null {
	return gramsFromMassResolution(quantity, unit, name);
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
		// Count/can/pack packages have no mass. Keep an existing household
		// perServing (USDA cup/serving) when the prior package was also massless —
		// wiping it forces density-only cargo and breaks provision Eat macros.
		// Still clear when shrinking from a known mass package (e.g. 1 L → 1 unit)
		// so liter package totals are never treated as per-count nutrients.
		const priorMassUnknown = oldGrams == null || oldGrams <= 0;
		return {
			...snapshot,
			per100g,
			perServing: priorMassUnknown ? (snapshot.perServing ?? null) : null,
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
