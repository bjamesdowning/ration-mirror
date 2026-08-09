/**
 * Pure nutrition helpers (safe for client + unit tests).
 * Server modules (`*.server.ts`) must be imported directly.
 */

export {
	computeMealNutrition,
	type MealNutritionIngredientInput,
} from "./compute-meal-nutrition";
export {
	FOOD_NUTRIENT_COLUMNS,
	NUTRIENT_KEYS,
	NUTRITION_COVERAGE_THRESHOLD,
	NUTRITION_FDC_CACHE_TTL_SECONDS,
	NUTRITION_FDC_KV_PREFIX,
	type NutrientKey,
} from "./constants";
export {
	aggregateManifestDayNutrition,
	type DayConsumedIntakeInput,
	type DayNutritionEntryInput,
	formatConsumedVsGoalKcal,
	type ManifestDayNutritionTotals,
} from "./day-totals";
export {
	isGoalEffectiveOnDate,
	nutritionIntakeRetentionCutoff,
	previousUtcCalendarDay,
} from "./goal-effective";
export {
	applyUserOverrideToSnapshot,
	blankCargoNutritionSnapshot,
	formatCoveragePercent,
	getDisplayNutrients,
	isMealNutritionSnapshot,
	KJ_PER_KCAL,
	kcalToKj,
	type MacroPatch,
	type ProvenanceLabel,
	provenanceLabel,
} from "./panel-helpers";
export { type ParsedIngredient, parseIngredient } from "./parse-ingredient";
export {
	addNutrients,
	convertIngredientAmount,
	convertIngredientAmountToGrams,
	emptyNutrients,
	nutrientsPerServingFromTotal,
	scaleNutrientsPer100g,
	scaleNutrientValues,
} from "./scale-nutrients";
export type {
	CargoNutritionSnapshot,
	MealNutritionResult,
	MealNutritionSnapshot,
	NutrientAttribution,
	NutrientsPer100g,
	NutrientsPerServing,
	NutrientValues,
	NutritionSnapshot,
	NutritionSource,
	ResolvedFood,
} from "./types";
