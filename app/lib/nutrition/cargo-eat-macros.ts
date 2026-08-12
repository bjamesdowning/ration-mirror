/**
 * Client-safe scaling of cargo nutrition for Quick Eat preview.
 * Matches server recompute rules: mass/volume from density; count from
 * household/package `perServing` — never treat `per100g` as per count unit.
 */

import {
	getUnitFamily,
	isDiscreteCountFamily,
	type SupportedUnit,
	toSupportedUnit,
} from "~/lib/units";
import type { NutrientValues, NutritionSnapshot } from "./types";

export type CargoEatMacroPreview = {
	energyKcal: number | null;
	proteinG: number | null;
	carbG: number | null;
	fatG: number | null;
};

const EMPTY: CargoEatMacroPreview = {
	energyKcal: null,
	proteinG: null,
	carbG: null,
	fatG: null,
};

function hasAnyMacro(n: {
	energyKcal?: number | null;
	proteinG?: number | null;
	carbG?: number | null;
	fatG?: number | null;
}): boolean {
	return (
		(n.energyKcal != null && Number.isFinite(n.energyKcal)) ||
		(n.proteinG != null && Number.isFinite(n.proteinG)) ||
		(n.carbG != null && Number.isFinite(n.carbG)) ||
		(n.fatG != null && Number.isFinite(n.fatG))
	);
}

function scaleBlock(
	block: NutrientValues,
	factor: number,
): CargoEatMacroPreview {
	return {
		energyKcal:
			block.energyKcal != null && Number.isFinite(block.energyKcal)
				? block.energyKcal * factor
				: null,
		proteinG:
			block.proteinG != null && Number.isFinite(block.proteinG)
				? block.proteinG * factor
				: null,
		carbG:
			block.carbG != null && Number.isFinite(block.carbG)
				? block.carbG * factor
				: null,
		fatG:
			block.fatG != null && Number.isFinite(block.fatG)
				? block.fatG * factor
				: null,
	};
}

function gramsForMassVolumeUnit(
	quantity: number,
	unit: SupportedUnit,
): number | null {
	switch (unit) {
		case "g":
		case "ml":
			return quantity;
		case "kg":
		case "l":
			return quantity * 1000;
		default:
			return null;
	}
}

export type ScaleCargoEatMacrosInput = {
	nutrition: NutritionSnapshot | null | undefined;
	quantity: number;
	unit: string;
	/** Cargo stock quantity when `perServing` is package totals (override/AI). */
	packageQuantity?: number | null;
};

/**
 * Scale cargo nutrition for an eat amount. Returns null macros when mass cannot
 * be resolved for density-only count stock (matches server intake honesty).
 */
export function scaleCargoEatMacros(
	input: ScaleCargoEatMacrosInput,
): CargoEatMacroPreview {
	const { nutrition, quantity, unit } = input;
	if (!nutrition || !(quantity > 0) || !Number.isFinite(quantity)) {
		return EMPTY;
	}

	const supported = toSupportedUnit(unit);
	const family = getUnitFamily(supported);

	const per100g = nutrition.per100g;
	if (per100g && hasAnyMacro(per100g)) {
		const grams = gramsForMassVolumeUnit(quantity, supported);
		if (grams != null && grams > 0) {
			return scaleBlock(per100g, grams / 100);
		}
	}

	const perServing = nutrition.perServing;
	if (perServing && hasAnyMacro(perServing)) {
		if (isDiscreteCountFamily(family)) {
			const packageQuantity = input.packageQuantity;
			const isPackageTotals =
				nutrition.per100g == null &&
				(nutrition.source === "user_override" ||
					nutrition.source === "ai_estimate") &&
				packageQuantity != null &&
				Number.isFinite(packageQuantity) &&
				packageQuantity > 0;
			const factor = isPackageTotals
				? quantity / (packageQuantity as number)
				: quantity;
			return scaleBlock(perServing, factor);
		}
		// Non-count with household serving (e.g. cup) — scale servings linearly.
		return scaleBlock(perServing, quantity);
	}

	// Density-only count/can/pack: no authentic per-unit mass → unavailable.
	return EMPTY;
}
