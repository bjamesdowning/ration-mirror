/**
 * Pure nutrition helpers (safe for client + unit tests).
 * Server modules (`*.server.ts`) must be imported directly.
 */

export {
	detectNutritionSchemaVersion,
	isNutritionSnapshotV2,
	matchQualityFromLegacy,
	normalizeNutritionSnapshot,
	projectNutritionSnapshotToLegacy,
	upgradeNutritionSnapshotToV2,
} from "./adapters";
export {
	computeMealNutrition,
	type MealNutritionIngredientInput,
} from "./compute-meal-nutrition";
export {
	FOOD_NUTRIENT_COLUMNS,
	NUTRIENT_KEYS,
	NUTRITION_COVERAGE_THRESHOLD,
	NUTRITION_DATASET_SNAPSHOT_ID,
	NUTRITION_FDC_CACHE_TTL_SECONDS,
	NUTRITION_FDC_KV_PREFIX,
	NUTRITION_MATCHER_VERSION,
	NUTRITION_PORTION_MATCHER_VERSION,
	type NutrientKey,
	nutritionMatchCacheKey,
	nutritionPortionCacheKey,
} from "./constants";
export {
	aggregateManifestDayNutrition,
	type DayConsumedIntakeInput,
	type DayNutrientTotals,
	type DayNutritionEntryInput,
	emptyDayNutrientTotals,
	formatConsumedVsGoal,
	formatConsumedVsGoalKcal,
	formatGoalProgressStrip,
	type GoalProgressLine,
	goalTargetsFromRow,
	hasAnyGoalTarget,
	type ManifestDayNutritionTotals,
	selectGoalProgressLines,
	type UserGoalTargets,
} from "./day-totals";
export {
	isGoalEffectiveOnDate,
	nutritionIntakeRetentionCutoff,
	previousUtcCalendarDay,
} from "./goal-effective";
export { sha256Hex } from "./hash";
export {
	gramsFromMassResolution,
	type ResolveIngredientMassOptions,
	resolveIngredientMass,
} from "./mass-resolution";
export {
	type CargoOverrideCandidate,
	nutrientsPer100gFromCargoOverride,
	nutrientsPer100gFromPackageTotals,
	pickBestCargoOverrideForIngredient,
	withDerivedPer100g,
} from "./override-scale";
export {
	cargoPackageSizeChanged,
	gramsForNutritionPackage,
	type ScaleCargoNutritionOptions,
	scaleCargoNutritionToPackage,
} from "./package-scale";
export {
	applyUserOverrideToSnapshot,
	blankCargoNutritionSnapshot,
	type CargoNutritionBasisLabel,
	cargoNutritionBasisLabel,
	formatCoveragePercent,
	getDisplayNutrients,
	isMealNutritionSnapshot,
	KJ_PER_KCAL,
	kcalToKj,
	type MacroPatch,
	nutritionPanelBasisSuffix,
	type ProvenanceLabel,
	provenanceLabel,
} from "./panel-helpers";
export { type ParsedIngredient, parseIngredient } from "./parse-ingredient";
export {
	addKnownNutrients,
	addNutrients,
	convertIngredientAmount,
	convertIngredientAmountToGrams,
	emptyNutrientRecord,
	emptyNutrients,
	nutrientCoverageRatio,
	nutrientsPerServingFromTotal,
	projectNullableValuesToLegacy,
	scaleNullableNutrientValues,
	scaleNutrientsPer100g,
	scaleNutrientValues,
	toNullableNutrientValues,
	zeroNutrientAccumulator,
} from "./scale-nutrients";
export type {
	AnyNutritionSnapshot,
	CargoNutritionSnapshot,
	MassResolutionMethod,
	MassResolutionResult,
	MealNutritionResult,
	MealNutritionSnapshot,
	NullableNutrientValues,
	NutrientAttribution,
	NutrientsPer100g,
	NutrientsPerServing,
	NutrientValues,
	NutritionMassMeta,
	NutritionMatchMeta,
	NutritionMatchQuality,
	NutritionProvenance,
	NutritionSchemaVersion,
	NutritionServingBasis,
	NutritionSnapshot,
	NutritionSnapshotV2,
	NutritionSource,
	ResolvedFood,
} from "./types";
