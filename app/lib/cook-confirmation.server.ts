import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { activeMealSelection, meal } from "../db/schema";
import {
	getMealMissingIngredients,
	type MissingIngredientDetail,
} from "./matching.server";
import { type CargoDeduction, cookMeal } from "./meals.server";

export type CookMealWithConfirmationResult = {
	cooked: boolean;
	ingredientsDeducted?: number;
	servings?: number;
	deductions: CargoDeduction[];
	requiresConfirmation?: boolean;
	missingIngredients?: MissingIngredientDetail[];
	partialCook?: boolean;
	skippedIngredients?: MissingIngredientDetail[];
};

async function resolveEffectiveCookServings(
	env: Env,
	organizationId: string,
	mealId: string,
	servingsOverride?: number,
): Promise<number> {
	if (servingsOverride != null) return servingsOverride;
	const d1 = drizzle(env.DB);
	const [mealResults, selectionResults] = await d1.batch([
		d1
			.select({ servings: meal.servings })
			.from(meal)
			.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId))),
		d1
			.select({ servingsOverride: activeMealSelection.servingsOverride })
			.from(activeMealSelection)
			.where(
				and(
					eq(activeMealSelection.organizationId, organizationId),
					eq(activeMealSelection.mealId, mealId),
				),
			),
	]);
	const base = mealResults[0]?.servings ?? 1;
	const override = selectionResults[0]?.servingsOverride;
	return override ?? base;
}

/** Cook with manifest-style confirmation when cargo is insufficient. */
export async function cookMealWithConfirmation(
	env: Env,
	organizationId: string,
	mealId: string,
	options?: { servings?: number; confirmInsufficient?: boolean },
): Promise<CookMealWithConfirmationResult> {
	const effectiveServings = await resolveEffectiveCookServings(
		env,
		organizationId,
		mealId,
		options?.servings,
	);

	if (!options?.confirmInsufficient) {
		const missingIngredients = await getMealMissingIngredients(
			env,
			organizationId,
			mealId,
			effectiveServings,
		);
		if (missingIngredients.length > 0) {
			return {
				cooked: false,
				deductions: [],
				requiresConfirmation: true,
				missingIngredients,
			};
		}
	}

	const result = await cookMeal(env, organizationId, mealId, {
		servings: effectiveServings,
		deductionMode: options?.confirmInsufficient ? "partial" : "strict",
	});
	return {
		cooked: true,
		ingredientsDeducted: result.ingredientsDeducted,
		servings: result.servings,
		deductions: result.deductions,
		partialCook: result.partialCook,
		skippedIngredients: result.skippedIngredients,
	};
}
