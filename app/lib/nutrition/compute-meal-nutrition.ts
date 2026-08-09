import type { SupportedUnit } from "~/lib/units";
import {
	addNutrients,
	convertIngredientAmountToGrams,
	emptyNutrients,
	nutrientsPerServingFromTotal,
	scaleNutrientsPer100g,
} from "./scale-nutrients";
import type {
	MealNutritionResult,
	NutrientAttribution,
	NutrientsPer100g,
	NutritionSource,
} from "./types";

export type MealNutritionIngredientInput = {
	name: string;
	quantity: number | null;
	unit: SupportedUnit | null;
	/** When set, this ingredient contributes nutrients. */
	nutrientsPer100g: NutrientsPer100g | null;
	fdcId?: number | null;
	source?: NutritionSource;
	/** Optional precomputed grams; otherwise derived from quantity/unit. */
	grams?: number | null;
};

/**
 * Pure meal nutrition aggregate: scale resolved per-100g nutrients by mass,
 * sum, divide by servings, and compute coverage + attributions.
 *
 * Coverage = matched grams / total grams among ingredients that convert to grams.
 * Ingredients that cannot convert to grams are excluded from both numerator and
 * denominator (they neither help nor hurt coverage). Unresolved ingredients with
 * known grams count against coverage.
 */
export function computeMealNutrition(
	ingredients: MealNutritionIngredientInput[],
	servings = 1,
): MealNutritionResult {
	let matchedGrams = 0;
	let totalGrams = 0;
	let total = emptyNutrients();
	const attributions: NutrientAttribution[] = [];

	for (let i = 0; i < ingredients.length; i++) {
		const ing = ingredients[i];
		if (!ing) continue;

		const grams =
			ing.grams ??
			(ing.quantity !== null && ing.unit
				? convertIngredientAmountToGrams(ing.quantity, ing.unit, ing.name)
				: null);

		if (grams === null || !Number.isFinite(grams) || grams <= 0) {
			continue;
		}

		totalGrams += grams;

		if (!ing.nutrientsPer100g) {
			continue;
		}

		matchedGrams += grams;
		const contribution = scaleNutrientsPer100g(ing.nutrientsPer100g, grams);
		total = addNutrients(total, contribution);
		attributions.push({
			ingredientIndex: i,
			ingredientName: ing.name,
			fdcId: ing.fdcId ?? null,
			source: ing.source ?? "usda",
			grams,
			contribution,
		});
	}

	const coverage = totalGrams > 0 ? matchedGrams / totalGrams : 0;

	return {
		perServing: nutrientsPerServingFromTotal(total, servings),
		coverage,
		attributions: attributions.map((a) => ({
			...a,
			contribution: nutrientsPerServingFromTotal(a.contribution, servings),
		})),
	};
}
