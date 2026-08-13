import type { SupportedUnit } from "~/lib/units";
import {
	addNutrients,
	convertIngredientAmountToGrams,
	nutrientsPerServingFromTotal,
	scaleNutrientsPer100g,
	zeroNutrientAccumulator,
} from "./scale-nutrients";
import type {
	MealNutritionResult,
	NutrientAttribution,
	NutrientsPer100g,
	NutrientValues,
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
	/**
	 * When mass cannot be derived (count units), contribute these nutrients
	 * directly to the meal total (already scaled for the ingredient quantity).
	 */
	directContribution?: NutrientValues | null;
};

/**
 * Pure meal nutrition aggregate: scale resolved per-100g nutrients by mass,
 * sum, divide by servings, and compute coverage + attributions.
 *
 * Coverage = matched grams / total grams among ingredients that convert to grams.
 * Ingredients that cannot convert to grams are excluded from both numerator and
 * denominator (they neither help nor hurt coverage), unless they provide a
 * {@link MealNutritionIngredientInput.directContribution}. Unresolved ingredients
 * with known grams count against coverage. When every matched contribution is
 * direct (no mass), coverage is 1.
 */
export function computeMealNutrition(
	ingredients: MealNutritionIngredientInput[],
	servings = 1,
): MealNutritionResult {
	let matchedGrams = 0;
	let totalGrams = 0;
	let directMatched = 0;
	let total = zeroNutrientAccumulator();
	const attributions: NutrientAttribution[] = [];

	for (let i = 0; i < ingredients.length; i++) {
		const ing = ingredients[i];
		if (!ing) continue;

		const grams =
			ing.grams ??
			(ing.quantity !== null && ing.unit
				? convertIngredientAmountToGrams(ing.quantity, ing.unit, ing.name)
				: null);

		if (grams !== null && Number.isFinite(grams) && grams > 0) {
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
			continue;
		}

		const direct = ing.directContribution;
		if (direct) {
			directMatched += 1;
			total = addNutrients(total, direct);
			attributions.push({
				ingredientIndex: i,
				ingredientName: ing.name,
				fdcId: ing.fdcId ?? null,
				source: ing.source ?? "usda",
				grams: null,
				contribution: direct,
			});
		}
	}

	const coverage =
		totalGrams > 0 ? matchedGrams / totalGrams : directMatched > 0 ? 1 : 0;

	return {
		perServing: nutrientsPerServingFromTotal(total, servings),
		coverage,
		attributions: attributions.map((a) => ({
			...a,
			contribution: nutrientsPerServingFromTotal(a.contribution, servings),
		})),
		recipeMassG: totalGrams > 0 ? totalGrams : null,
	};
}
