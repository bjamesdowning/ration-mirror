import { convertIngredientAmount, type SupportedUnit } from "~/lib/units";
import type {
	NutrientsPer100g,
	NutrientsPerServing,
	NutrientValues,
} from "./types";

/** Scale per-100g nutrients by ingredient mass in grams. */
export function scaleNutrientsPer100g(
	per100g: NutrientsPer100g,
	grams: number,
): NutrientsPerServing {
	if (!Number.isFinite(grams) || grams <= 0) {
		return emptyNutrients();
	}
	const factor = grams / 100;
	return scaleValues(per100g, factor);
}

/** Divide total nutrients by serving count (guards against zero/negative). */
export function nutrientsPerServingFromTotal(
	total: NutrientValues,
	servings: number,
): NutrientsPerServing {
	if (!Number.isFinite(servings) || servings <= 0) {
		return emptyNutrients();
	}
	return scaleValues(total, 1 / servings);
}

/**
 * Convert an ingredient amount to grams using {@link convertIngredientAmount}
 * (weight families + density-backed volume).
 */
export function convertIngredientAmountToGrams(
	quantity: number,
	unit: SupportedUnit,
	ingredientName?: string | null,
): number | null {
	if (!Number.isFinite(quantity) || quantity <= 0) return null;
	return convertIngredientAmount(quantity, unit, "g", ingredientName);
}

export { convertIngredientAmount };

export function emptyNutrients(): NutrientValues {
	return {
		energyKcal: 0,
		proteinG: 0,
		fatG: 0,
		carbG: 0,
		fiberG: 0,
		sugarG: 0,
		satFatG: 0,
		sodiumMg: 0,
		saltG: 0,
	};
}

export function addNutrients(
	a: NutrientValues,
	b: NutrientValues,
): NutrientValues {
	return {
		energyKcal: a.energyKcal + b.energyKcal,
		proteinG: a.proteinG + b.proteinG,
		fatG: a.fatG + b.fatG,
		carbG: a.carbG + b.carbG,
		fiberG: (a.fiberG ?? 0) + (b.fiberG ?? 0),
		sugarG: (a.sugarG ?? 0) + (b.sugarG ?? 0),
		satFatG: (a.satFatG ?? 0) + (b.satFatG ?? 0),
		sodiumMg: (a.sodiumMg ?? 0) + (b.sodiumMg ?? 0),
		saltG: (a.saltG ?? 0) + (b.saltG ?? 0),
	};
}

/** Multiply nutrient values by a portion / serving factor. */
export function scaleNutrientValues(
	values: NutrientValues,
	factor: number,
): NutrientValues {
	if (!Number.isFinite(factor) || factor === 0) {
		return emptyNutrients();
	}
	return scaleValues(values, factor);
}

function scaleValues(values: NutrientValues, factor: number): NutrientValues {
	const scale = (n: number | null): number | null =>
		n === null || n === undefined ? null : n * factor;

	return {
		energyKcal: values.energyKcal * factor,
		proteinG: values.proteinG * factor,
		fatG: values.fatG * factor,
		carbG: values.carbG * factor,
		fiberG: scale(values.fiberG),
		sugarG: scale(values.sugarG),
		satFatG: scale(values.satFatG),
		sodiumMg: scale(values.sodiumMg),
		saltG: scale(values.saltG),
	};
}
