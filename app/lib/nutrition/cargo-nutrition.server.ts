import type { SupportedUnit } from "~/lib/units";
import { estimateNutritionWithAi } from "./ai-estimate.server";
import { resolveFoodName } from "./resolve-food.server";
import {
	convertIngredientAmountToGrams,
	scaleNutrientsPer100g,
} from "./scale-nutrients";
import type { NutritionSnapshot } from "./types";

export type ResolveCargoNutritionOptions = {
	quantity?: number | null;
	unit?: SupportedUnit | null;
	/**
	 * When true (caller already checked nutrition-ai-estimate), attempt AI fill
	 * on USDA miss. Default false — manual/CSV/API paths must never AI-estimate.
	 */
	allowAiEstimate?: boolean;
	organizationId?: string;
	userId?: string;
};

/**
 * Resolve nutrition for a cargo item name against USDA seed DB.
 * Returns a NutritionSnapshot or null when unresolved.
 */
export async function resolveAndBuildCargoNutrition(
	env: Env,
	name: string,
	opts?: ResolveCargoNutritionOptions,
): Promise<NutritionSnapshot | null> {
	const resolved = await resolveFoodName(env, name);
	if (resolved) {
		const grams =
			opts?.quantity != null && opts.unit
				? convertIngredientAmountToGrams(opts.quantity, opts.unit, name)
				: null;
		const perServing =
			grams != null
				? scaleNutrientsPer100g(resolved.nutrientsPer100g, grams)
				: null;

		const highConfidence = resolved.highConfidence === true;
		return {
			source: "usda",
			confidence: highConfidence ? 1 : 0.7,
			verified: highConfidence,
			per100g: resolved.nutrientsPer100g,
			perServing,
			fdcId: resolved.fdcId,
			description: resolved.description,
		};
	}

	if (opts?.allowAiEstimate) {
		return estimateNutritionWithAi(env, name, {
			quantity: opts.quantity,
			unit: opts.unit,
			organizationId: opts.organizationId,
			userId: opts.userId,
		});
	}

	return null;
}
