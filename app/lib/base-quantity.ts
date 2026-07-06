import { isLikelyLiquidIngredient } from "./ingredient-density";
import {
	type BaseUnit,
	convertIngredientAmount,
	getUnitFamily,
	normalizeToBaseUnit,
	toSupportedUnit,
} from "./units";

export interface BaseQuantityFields {
	baseQuantity: number;
	baseUnit: BaseUnit;
}

/**
 * Derives canonical base storage from authored quantity + unit.
 * Uses same-family normalization first; when density is known, volume solids
 * canonicalize to grams for consistent cross-family math.
 */
export function computeBaseFields(
	quantity: number,
	unit: string,
	ingredientName?: string | null,
): BaseQuantityFields {
	try {
		const safeUnit = toSupportedUnit(unit);
		const normalized = normalizeToBaseUnit(quantity, safeUnit);
		const name = ingredientName?.trim();

		if (
			name &&
			getUnitFamily(safeUnit) === "volume" &&
			!isLikelyLiquidIngredient(name)
		) {
			const grams = convertIngredientAmount(quantity, safeUnit, "g", name);
			if (grams !== null) {
				return { baseQuantity: grams, baseUnit: "g" };
			}
		}

		return {
			baseQuantity: normalized.quantity,
			baseUnit: normalized.unit,
		};
	} catch {
		return { baseQuantity: quantity, baseUnit: "unit" };
	}
}

/** Uses persisted base columns when set; recomputes for pre-backfill default rows. */
export function effectiveBaseFields(
	quantity: number,
	unit: string,
	baseQuantity: number,
	baseUnit: string,
	ingredientName?: string | null,
): BaseQuantityFields {
	const computed = computeBaseFields(quantity, unit, ingredientName);
	if (
		baseUnit === "unit" &&
		(baseQuantity !== computed.baseQuantity || computed.baseUnit !== "unit")
	) {
		return computed;
	}
	return { baseQuantity, baseUnit: baseUnit as BaseUnit };
}
