import type { NutrientKey } from "./constants";

/** Provenance of a nutrition snapshot. */
export type NutritionSource = "usda" | "ai_estimate" | "user_override";

/** Contract version for persisted nutrition JSON. */
export type NutritionSchemaVersion = 1 | 2;

/** Match quality tier (v2 additive — maps from legacy confidence/verified). */
export type NutritionMatchQuality =
	| "verified"
	| "high"
	| "medium"
	| "low"
	| "unknown";

/** Which nutrient block is authoritative in a snapshot (v2). */
export type NutritionServingBasis = "per100g" | "perServing" | "package";

/** Core nutrient values (per 100 g or per serving — same shape). Legacy v1 contract. */
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

/** v2 nutrient record — unknown fields are null, not coerced to zero. */
export type NullableNutrientValues = {
	energyKcal: number | null;
	proteinG: number | null;
	fatG: number | null;
	carbG: number | null;
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
/** Dataset / nutrient provenance for v2 snapshots (immutable historical fact). */
export type NutritionProvenance = {
	provider: "usda_fdc" | "ai" | "user" | "unknown";
	dataType: string | null;
	datasetRelease: string | null;
	datasetSnapshotId: string | null;
	importedAt: string | null;
	nutrientIds: Partial<Record<NutrientKey, number | null>> | null;
	derivations: Partial<Record<NutrientKey, string>> | null;
	model: string | null;
	promptVersion: string | null;
	generatedAt: string | null;
};

/** Mass resolution method for ingredient / package scaling. */
export type MassResolutionMethod =
	| "direct_mass"
	| "fdc_portion"
	| "density"
	| "assumed_1g_ml"
	| "explicit"
	| "unknown";

export type NutritionMatchMeta = {
	matcherVersion: string;
	quality: NutritionMatchQuality;
	score: number | null;
	margin: number | null;
	method:
		| "exact"
		| "fts_rank"
		| "alias"
		| "org_ledger"
		| "user"
		| "barcode"
		| "unknown";
};

export type NutritionMassMeta = {
	grams: number | null;
	method: MassResolutionMethod;
	confidence: number;
	portionId: number | null;
	portionDescription: string | null;
};

/** Legacy v1 nutrition snapshot (implicit schemaVersion 1). */
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

/** v2 additive metadata on nutrition snapshots (stored JSON may omit on legacy rows). */
export type NutritionSnapshotV2Meta = {
	schemaVersion: 2;
	/** Stable external reference, e.g. `fdc:12345` or `cargo:<uuid>`. */
	sourceRef: string | null;
	matchQuality: NutritionMatchQuality;
	servingBasis: NutritionServingBasis | null;
	/** Fraction of nutrient fields with known (non-null) values (0–1). */
	nutrientCoverage: number;
	provenance?: NutritionProvenance | null;
	match?: NutritionMatchMeta | null;
	mass?: NutritionMassMeta | null;
};

/** v2 contract — nullable nutrient math with additive metadata. */
export type NutritionSnapshotV2 = NutritionSnapshotV2Meta & {
	source: NutritionSource;
	confidence: number;
	verified: boolean;
	per100g: NullableNutrientValues | null;
	perServing: NullableNutrientValues | null;
	fdcId: number | null;
	description: string | null;
};

/** Union of persisted snapshot shapes. */
export type AnyNutritionSnapshot = NutritionSnapshot | NutritionSnapshotV2;

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

export type MassResolutionResult = {
	grams: number | null;
	method: MassResolutionMethod;
	/** 0–1 confidence in the resolved mass. */
	confidence: number;
	/** True when mass is inferred rather than measured (density, 1 g/ml, etc.). */
	estimated: boolean;
};

/** Resolved USDA food row (from NUTRITION_DB). */
export type ResolvedFood = {
	fdcId: number;
	description: string;
	/** Per-100g nutrients — core macros stay null when unknown (never coerced to 0). */
	nutrientsPer100g: NullableNutrientValues;
	dataType?: string | null;
	/** Ranker raw score when resolved via FTS re-rank. */
	matchScore?: number;
	normalizedScore?: number;
	scoreMargin?: number;
	matchQuality?: NutritionMatchQuality;
	/** True only when auto-attach gates pass (score + margin). */
	autoAccept?: boolean;
	/**
	 * @deprecated Prefer `autoAccept` / `matchQuality`. Never implies `verified`.
	 */
	highConfidence?: boolean;
	energyNutrientId?: number | null;
	saltDerivation?: string | null;
	provenance?: NutritionProvenance | null;
	match?: NutritionMatchMeta | null;
};
