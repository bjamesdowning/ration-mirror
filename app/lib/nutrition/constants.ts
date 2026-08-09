/** Minimum matched-mass ratio before meal nutrition is considered "complete". */
export const NUTRITION_COVERAGE_THRESHOLD = 0.9;

/** KV key prefix for FDC resolve cache (v2 busts bad FTS LIMIT 1 hits). */
export const NUTRITION_FDC_KV_PREFIX = "nutrition:fdc:v2:";

/** Cache TTL for food resolve hits (7 days). */
export const NUTRITION_FDC_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Shorter TTL for resolve misses (negative cache). */
export const NUTRITION_FDC_NEGATIVE_CACHE_TTL_SECONDS = 60 * 60;

/** Bound concurrent USDA resolves within a meal / batch. */
export const NUTRITION_RESOLVE_CONCURRENCY = 5;

/** Bound concurrent meal recomputes after cargo nutrition update. */
export const NUTRITION_MEAL_RECOMPUTE_CONCURRENCY = 3;

/** Canonical nutrient field keys (JS / snapshot). */
export const NUTRIENT_KEYS = [
	"energyKcal",
	"proteinG",
	"fatG",
	"carbG",
	"fiberG",
	"sugarG",
	"satFatG",
	"sodiumMg",
	"saltG",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** SQL column names on `food_nutrient` (snake_case). */
export const FOOD_NUTRIENT_COLUMNS = [
	"energy_kcal",
	"protein_g",
	"fat_g",
	"carb_g",
	"fiber_g",
	"sugar_g",
	"sat_fat_g",
	"sodium_mg",
	"salt_g",
] as const;
