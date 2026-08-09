/** Provenance of a nutrition snapshot. */
export type NutritionSource = "usda" | "ai_estimate" | "user_override";

/** Core nutrient values (per 100 g or per serving — same shape). */
export type NutrientValues = {
	energyKcal: number;
	proteinG: number;
	fatG: number;
	carbG: number;
	fiberG: number | null;
	sugarG: number | null;
	satFatG: number | null;
	sodiumMg: number | null;
	saltG: number | null;
};

export type NutrientsPer100g = NutrientValues;
export type NutrientsPerServing = NutrientValues;

/**
 * Attached nutrition for a cargo item or ingredient match.
 * `verified` is true only for USDA (and future user-confirmed overrides).
 */
export type NutritionSnapshot = {
	source: NutritionSource;
	/** 0–1 confidence; USDA matches are typically 1. */
	confidence: number;
	verified: boolean;
	per100g: NutrientsPer100g | null;
	perServing: NutrientsPerServing | null;
	fdcId: number | null;
	description: string | null;
};

/** Per-ingredient contribution toward a meal total. */
export type NutrientAttribution = {
	ingredientIndex: number;
	ingredientName: string;
	fdcId: number | null;
	source: NutritionSource;
	grams: number | null;
	contribution: NutrientsPerServing;
};

/**
 * Aggregated meal nutrition: per-serving totals, coverage ratio, and attributions.
 * Coverage is matched ingredient mass / total convertible mass (0–1).
 */
export type MealNutritionResult = {
	perServing: NutrientsPerServing;
	coverage: number;
	attributions: NutrientAttribution[];
};

/** Cargo row JSON shape (same as NutritionSnapshot). */
export type CargoNutritionSnapshot = NutritionSnapshot;

/**
 * Persisted meal.nutrition JSON: aggregate result plus computation timestamp.
 * Attributions are stored as a compact summary (no per-attribution contribution
 * masses beyond the contribution nutrients already on each row).
 */
export type MealNutritionSnapshot = {
	perServing: NutrientsPerServing;
	coverage: number;
	attributions: NutrientAttribution[];
	computedAt: string;
};

/** Resolved USDA food row (from NUTRITION_DB). */
export type ResolvedFood = {
	fdcId: number;
	description: string;
	nutrientsPer100g: NutrientsPer100g;
};
