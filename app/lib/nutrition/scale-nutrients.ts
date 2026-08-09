import { convertIngredientAmount, type SupportedUnit } from "~/lib/units";
import { NUTRIENT_KEYS } from "./constants";
import type {
	NullableNutrientValues,
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
		return zeroNutrientAccumulator();
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
		return zeroNutrientAccumulator();
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

/** Zero-valued accumulator for legacy meal/cargo sums (unknown optional fields → 0). */
export function zeroNutrientAccumulator(): NutrientValues {
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

/** All-null nutrient record — unknown state for v2 contract. */
export function emptyNutrientRecord(): NullableNutrientValues {
	return {
		energyKcal: null,
		proteinG: null,
		fatG: null,
		carbG: null,
		fiberG: null,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
	};
}

/**
 * @deprecated Prefer {@link zeroNutrientAccumulator} (sums) or
 * {@link emptyNutrientRecord} (unknown v2 state).
 */
export function emptyNutrients(): NutrientValues {
	return zeroNutrientAccumulator();
}

/** Legacy sum — treats null optional fields as zero. */
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

/** v2 sum — preserves null as unknown; combines known values only. */
export function addKnownNutrients(
	a: NullableNutrientValues,
	b: NullableNutrientValues,
): NullableNutrientValues {
	const combine = (x: number | null, y: number | null): number | null => {
		if (x == null && y == null) return null;
		return (x ?? 0) + (y ?? 0);
	};

	return {
		energyKcal: combine(a.energyKcal, b.energyKcal),
		proteinG: combine(a.proteinG, b.proteinG),
		fatG: combine(a.fatG, b.fatG),
		carbG: combine(a.carbG, b.carbG),
		fiberG: combine(a.fiberG, b.fiberG),
		sugarG: combine(a.sugarG, b.sugarG),
		satFatG: combine(a.satFatG, b.satFatG),
		sodiumMg: combine(a.sodiumMg, b.sodiumMg),
		saltG: combine(a.saltG, b.saltG),
	};
}

/** Multiply nutrient values by a portion / serving factor. Null optional fields stay null. */
export function scaleNutrientValues(
	values: NutrientValues,
	factor: number,
): NutrientValues {
	if (!Number.isFinite(factor) || factor === 0) {
		return zeroNutrientAccumulator();
	}
	return scaleValues(values, factor);
}

/** Scale v2 nullable nutrients — null in → null out. */
export function scaleNullableNutrientValues(
	values: NullableNutrientValues,
	factor: number,
): NullableNutrientValues {
	if (!Number.isFinite(factor) || factor === 0) {
		return emptyNutrientRecord();
	}
	return scaleNullableValues(values, factor);
}

export function toNullableNutrientValues(
	values: NutrientValues,
): NullableNutrientValues {
	return { ...values };
}

export function projectNullableValuesToLegacy(
	values: NullableNutrientValues,
): NutrientValues {
	return projectNullableToLegacy(values);
}

export function projectNullableToLegacy(
	values: NullableNutrientValues,
): NutrientValues {
	return {
		energyKcal: values.energyKcal ?? 0,
		proteinG: values.proteinG ?? 0,
		fatG: values.fatG ?? 0,
		carbG: values.carbG ?? 0,
		fiberG: values.fiberG,
		sugarG: values.sugarG,
		satFatG: values.satFatG,
		sodiumMg: values.sodiumMg,
		saltG: values.saltG,
	};
}

/** Fraction of canonical nutrient keys with non-null values (0–1). */
export function nutrientCoverageRatio(
	values: NullableNutrientValues | null,
): number {
	if (!values) return 0;
	let known = 0;
	for (const key of NUTRIENT_KEYS) {
		if (values[key] != null) known += 1;
	}
	return known / NUTRIENT_KEYS.length;
}

function scaleValues(values: NutrientValues, factor: number): NutrientValues {
	const scaleOptional = (n: number | null): number | null =>
		n === null || n === undefined ? null : n * factor;

	return {
		energyKcal: values.energyKcal * factor,
		proteinG: values.proteinG * factor,
		fatG: values.fatG * factor,
		carbG: values.carbG * factor,
		fiberG: scaleOptional(values.fiberG),
		sugarG: scaleOptional(values.sugarG),
		satFatG: scaleOptional(values.satFatG),
		sodiumMg: scaleOptional(values.sodiumMg),
		saltG: scaleOptional(values.saltG),
	};
}

function scaleNullableValues(
	values: NullableNutrientValues,
	factor: number,
): NullableNutrientValues {
	const scale = (n: number | null): number | null =>
		n == null ? null : n * factor;

	return {
		energyKcal: scale(values.energyKcal),
		proteinG: scale(values.proteinG),
		fatG: scale(values.fatG),
		carbG: scale(values.carbG),
		fiberG: scale(values.fiberG),
		sugarG: scale(values.sugarG),
		satFatG: scale(values.satFatG),
		sodiumMg: scale(values.sodiumMg),
		saltG: scale(values.saltG),
	};
}
