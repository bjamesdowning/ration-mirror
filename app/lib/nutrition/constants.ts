/** Minimum matched-mass ratio before meal nutrition is considered "complete". */
export const NUTRITION_COVERAGE_THRESHOLD = 0.9;

/**
 * Active nutrition-DB snapshot id for KV cache partitioning.
 * Bump / replace via nutrition-db/releases/current.json after a verified import.
 */
export const NUTRITION_DATASET_SNAPSHOT_ID = "dev-unpinned";

/** Bump when ranker / abstention rules change to bust stale KV hits. */
export const NUTRITION_MATCHER_VERSION = "1.2.0";

/** Bump when portion matcher heuristics change. */
export const NUTRITION_PORTION_MATCHER_VERSION = "1.0.0";

/** KV key prefix for FDC resolve cache (legacy reads still accepted). */
export const NUTRITION_FDC_KV_PREFIX = "nutrition:fdc:";

/** Build versioned KV cache key for food name resolve (hash = sha256 hex of name). */
export function nutritionMatchCacheKey(normalizedNameHash: string): string {
	return `nutrition:match:${NUTRITION_DATASET_SNAPSHOT_ID}:${NUTRITION_MATCHER_VERSION}:${normalizedNameHash}`;
}

/** Build versioned KV cache key for FDC portion lookup. */
export function nutritionPortionCacheKey(
	fdcId: number,
	unit: string,
	hintHash: string,
): string {
	return `nutrition:portion:${NUTRITION_DATASET_SNAPSHOT_ID}:${NUTRITION_PORTION_MATCHER_VERSION}:${fdcId}:${unit}:${hintHash}`;
}

/** Cache TTL for food resolve hits (7 days). */
export const NUTRITION_FDC_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Shorter TTL for resolve misses (negative cache). */
export const NUTRITION_FDC_NEGATIVE_CACHE_TTL_SECONDS = 60 * 60;

/** Automatic org ledger hit TTL (30 days). */
export const NUTRITION_ORG_MATCH_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Automatic org ledger miss TTL (6 hours). */
export const NUTRITION_ORG_MATCH_MISS_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Short TTL for automatic medium "review" ledger rows (with fdcId).
 * Abstention rows (review + null fdcId) are not written — they previously
 * poisoned lookups for the full hit TTL.
 */
export const NUTRITION_ORG_MATCH_REVIEW_TTL_MS = 6 * 60 * 60 * 1000;

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
