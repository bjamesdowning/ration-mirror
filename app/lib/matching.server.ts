import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cargo, meal, mealIngredient, mealTag } from "../db/schema";
import { lookupDensity } from "./ingredient-density";
import { log, redactId } from "./logging.server";
import { normalizeForMatch } from "./matching";
import { chunkedQuery } from "./query-utils.server";
import { getScaleFactor, scaleQuantity } from "./scale.server";
import {
	convertQuantity,
	convertQuantityWithDensity,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";
import {
	findSimilarCargoBatch,
	SIMILARITY_THRESHOLDS,
	type SimilarCargoMatch,
} from "./vector.server";
export { normalizeForMatch };

/**
 * Type definitions for meal matching
 */
export interface IngredientMatch {
	name: string;
	requiredQuantity: number;
	availableQuantity: number;
	unit: string;
}

export interface MissingIngredient {
	name: string;
	requiredQuantity: number;
	unit: string;
	isOptional: boolean;
}

export interface MealMatchResult {
	meal: typeof meal.$inferSelect & {
		ingredients: (typeof mealIngredient.$inferSelect)[];
		tags: string[];
	};
	matchPercentage: number;
	availableIngredients: IngredientMatch[];
	missingIngredients: MissingIngredient[];
	canMake: boolean;
}

export interface MealMatchQuery {
	mode: "strict" | "delta";
	minMatch?: number;
	limit?: number;
	/** Cap meals fetched before matching; bounds work for large orgs. Applied to SQL. */
	preLimit?: number;
	tag?: string;
	/** Override servings for all meals. Scales required quantities before comparing to cargo. */
	servings?: number;
}

/**
 * Normalizes ingredient names for fuzzy matching.
 * Converts to lowercase and removes punctuation, plurals.
 */
function normalizeIngredientName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s]/g, "") // Remove punctuation
		.replace(/s$/, "") // Remove trailing 's' for basic plural handling
		.replace(/\s+/g, " "); // Normalize whitespace
}

/**
 * Builds an cargo lookup map for efficient matching.
 * Groups cargo by normalized name with total quantities.
 */
function buildCargoIndex(items: (typeof cargo.$inferSelect)[]) {
	const index = new Map<
		string,
		{
			original: typeof cargo.$inferSelect;
			totalQuantity: number;
			normalizedName: string;
		}[]
	>();

	for (const item of items) {
		const normalized = normalizeIngredientName(item.name);
		const existing = index.get(normalized) || [];
		existing.push({
			original: item,
			totalQuantity: item.quantity,
			normalizedName: normalized,
		});
		index.set(normalized, existing);
	}

	return index;
}

/**
 * Converts cargo quantity to target unit and sums. Returns 0 if no convertible matches.
 * Falls back to density-based conversion (mass ↔ volume) when same-family conversion fails.
 */
function sumConvertedToTarget(
	matches: {
		original: typeof cargo.$inferSelect;
		totalQuantity: number;
		normalizedName: string;
	}[],
	targetUnit: SupportedUnit,
	ingredientName?: string,
): number {
	let total = 0;
	for (const match of matches) {
		const fromUnit = toSupportedUnit(match.original.unit);
		let converted = convertQuantity(match.totalQuantity, fromUnit, targetUnit);
		// Fallback: cross-family conversion using ingredient density (e.g. g → cup for flour)
		if (converted === null && ingredientName) {
			const density = lookupDensity(ingredientName);
			if (density) {
				converted = convertQuantityWithDensity(
					match.totalQuantity,
					fromUnit,
					targetUnit,
					density,
				);
			}
		}
		if (converted !== null) total += converted;
	}
	return total;
}

/**
 * Calculates available quantity using a pre-computed similarity map (sync).
 * Used after findSimilarCargoBatch for batch fallback lookups.
 */
function getAvailableQuantityWithMap(
	ingredientName: string,
	targetUnit: SupportedUnit,
	cargoIndex: ReturnType<typeof buildCargoIndex>,
	similarityMap: Map<string, SimilarCargoMatch[]>,
): number {
	const normalized = normalizeIngredientName(ingredientName);
	const matches = cargoIndex.get(normalized);

	if (!matches || matches.length === 0) {
		const similar = similarityMap.get(ingredientName) ?? [];
		if (similar.length === 0) return 0;
		for (const match of similar) {
			const bucket = cargoIndex.get(normalizeIngredientName(match.itemName));
			if (bucket?.length) {
				return sumConvertedToTarget(bucket, targetUnit, ingredientName);
			}
		}
		return 0;
	}

	return sumConvertedToTarget(matches, targetUnit, ingredientName);
}

/** Similarity map from findSimilarCargoBatch: ingredientName -> cargo matches */
type SimilarityMap = Map<string, SimilarCargoMatch[]>;

/**
 * Performs strict matching: only returns meals where ALL non-optional
 * ingredients are available in sufficient quantity.
 * scaleFactor applies to required quantities (for serving-size scaling).
 */
function strictMatch(
	meals: Array<{
		meal: typeof meal.$inferSelect;
		ingredients: (typeof mealIngredient.$inferSelect)[];
		tags: string[];
	}>,
	cargoIndex: ReturnType<typeof buildCargoIndex>,
	similarityMap: SimilarityMap,
	scaleFactor = 1,
): MealMatchResult[] {
	const results: MealMatchResult[] = [];

	for (const { meal: mealData, ingredients, tags } of meals) {
		const availableIngredients: IngredientMatch[] = [];
		const missingIngredients: MissingIngredient[] = [];

		for (const ingredient of ingredients) {
			const targetUnit = toSupportedUnit(ingredient.unit);
			const available = getAvailableQuantityWithMap(
				ingredient.ingredientName,
				targetUnit,
				cargoIndex,
				similarityMap,
			);
			const required = scaleQuantity(
				ingredient.quantity,
				scaleFactor,
				ingredient.unit,
			);

			if (available >= required) {
				availableIngredients.push({
					name: ingredient.ingredientName,
					requiredQuantity: required,
					availableQuantity: available,
					unit: ingredient.unit,
				});
			} else {
				missingIngredients.push({
					name: ingredient.ingredientName,
					requiredQuantity: required,
					unit: ingredient.unit,
					isOptional: ingredient.isOptional || false,
				});
			}
		}

		// In strict mode, must have ALL non-optional ingredients
		const hasAllRequired = missingIngredients.every((ing) => ing.isOptional);
		const matchPercentage = hasAllRequired ? 100 : 0;

		if (hasAllRequired) {
			results.push({
				meal: { ...mealData, ingredients, tags },
				matchPercentage,
				availableIngredients,
				missingIngredients,
				canMake: true,
			});
		}
	}

	return results;
}

/**
 * Performs delta matching: calculates percentage match based on
 * ingredient availability. Returns meals above minimum threshold.
 * scaleFactor applies to required quantities (for serving-size scaling).
 */
function deltaMatch(
	meals: Array<{
		meal: typeof meal.$inferSelect;
		ingredients: (typeof mealIngredient.$inferSelect)[];
		tags: string[];
	}>,
	cargoIndex: ReturnType<typeof buildCargoIndex>,
	similarityMap: SimilarityMap,
	minMatch = 50,
	scaleFactor = 1,
): MealMatchResult[] {
	const results: MealMatchResult[] = [];

	for (const { meal: mealData, ingredients, tags } of meals) {
		if (ingredients.length === 0) {
			// No ingredients = 100% match (edge case)
			results.push({
				meal: { ...mealData, ingredients, tags },
				matchPercentage: 100,
				availableIngredients: [],
				missingIngredients: [],
				canMake: true,
			});
			continue;
		}

		const availableIngredients: IngredientMatch[] = [];
		const missingIngredients: MissingIngredient[] = [];
		let totalIngredients = 0;
		let availableCount = 0;

		for (const ingredient of ingredients) {
			const targetUnit = toSupportedUnit(ingredient.unit);
			const available = getAvailableQuantityWithMap(
				ingredient.ingredientName,
				targetUnit,
				cargoIndex,
				similarityMap,
			);
			const required = scaleQuantity(
				ingredient.quantity,
				scaleFactor,
				ingredient.unit,
			);

			if (!ingredient.isOptional) {
				totalIngredients++;
				if (available >= required) availableCount++;
			}

			if (available >= required) {
				availableIngredients.push({
					name: ingredient.ingredientName,
					requiredQuantity: required,
					availableQuantity: available,
					unit: ingredient.unit,
				});
			} else {
				missingIngredients.push({
					name: ingredient.ingredientName,
					requiredQuantity: required,
					unit: ingredient.unit,
					isOptional: ingredient.isOptional || false,
				});
			}
		}

		const matchPercentage =
			totalIngredients === 0
				? 100
				: Math.round((availableCount / totalIngredients) * 100);

		if (matchPercentage >= minMatch) {
			results.push({
				meal: { ...mealData, ingredients, tags },
				matchPercentage,
				availableIngredients,
				missingIngredients,
				canMake: missingIngredients.every((ing) => ing.isOptional),
			});
		}
	}

	// Sort by match percentage descending
	return results.sort((a, b) => b.matchPercentage - a.matchPercentage);
}

/**
 * Main entry point for meal matching logic.
 * Fetches meals and cargo, then performs matching based on mode.
 */
export async function matchMeals(
	env: Env,
	organizationId: string,
	query: MealMatchQuery,
): Promise<MealMatchResult[]> {
	const d1 = drizzle(env.DB);
	const { mode, minMatch = 50, limit = 20, preLimit, tag, servings } = query;

	log.info("[matchMeals] Starting", {
		organizationId: redactId(organizationId),
		mode,
		minMatch,
		limit,
		preLimit,
		tag,
		servings,
	});

	// 0. KV cache lookup (60s TTL; repeat Hub visits return immediately)
	if (env.RATION_KV) {
		const cacheKey = getMatchCacheKey(organizationId, query);
		try {
			const cached = await env.RATION_KV.get(cacheKey, "json");
			if (Array.isArray(cached) && cached.length >= 0) {
				log.info("[matchMeals] Cache hit", { key: cacheKey });
				return cached as MealMatchResult[];
			}
		} catch {
			// Cache read failed; proceed to compute
		}
	}

	// 1. Fetch organization's meals (with optional tag filter)
	// preLimit caps meals before matching — bounds work for large orgs
	let mealQuery = tag
		? d1
				.select({
					id: meal.id,
					organizationId: meal.organizationId,
					name: meal.name,
					domain: meal.domain,
					type: meal.type,
					description: meal.description,
					directions: meal.directions,
					equipment: meal.equipment,
					servings: meal.servings,
					prepTime: meal.prepTime,
					cookTime: meal.cookTime,
					customFields: meal.customFields,
					createdAt: meal.createdAt,
					updatedAt: meal.updatedAt,
				})
				.from(meal)
				.innerJoin(mealTag, eq(meal.id, mealTag.mealId))
				.where(
					and(eq(meal.organizationId, organizationId), eq(mealTag.tag, tag)),
				)
		: d1.select().from(meal).where(eq(meal.organizationId, organizationId));

	if (preLimit != null && preLimit > 0) {
		mealQuery = mealQuery.limit(preLimit) as typeof mealQuery;
	}

	const meals = await mealQuery;
	log.info("[matchMeals] Found meals", { count: meals.length });

	if (meals.length === 0) {
		return [];
	}

	// 2. Fetch all ingredients and tags for these meals in parallel
	const mealIds = meals.map((m) => m.id);

	// Handle empty mealIds array
	if (mealIds.length === 0) {
		return [];
	}

	const [ingredientsData, tagsData] = await Promise.all([
		chunkedQuery(mealIds, (chunk) =>
			d1
				.select()
				.from(mealIngredient)
				.where(inArray(mealIngredient.mealId, chunk)),
		),
		chunkedQuery(mealIds, (chunk) =>
			d1.select().from(mealTag).where(inArray(mealTag.mealId, chunk)),
		),
	]);

	// Group ingredients and tags by meal ID
	const ingredientsByMeal = new Map<
		string,
		(typeof mealIngredient.$inferSelect)[]
	>();
	const tagsByMeal = new Map<string, string[]>();

	for (const ing of ingredientsData) {
		const existing = ingredientsByMeal.get(ing.mealId) || [];
		existing.push(ing);
		ingredientsByMeal.set(ing.mealId, existing);
	}

	for (const tag of tagsData) {
		const existing = tagsByMeal.get(tag.mealId) || [];
		existing.push(tag.tag);
		tagsByMeal.set(tag.mealId, existing);
	}

	// 3. Fetch organization's current cargo
	const orgCargo = await d1
		.select()
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));

	// 4. Build cargo index for efficient lookups
	const cargoIndex = buildCargoIndex(orgCargo);

	// 5. Combine meal data with ingredients and tags
	const enrichedMeals = meals.map((m) => ({
		meal: m,
		ingredients: ingredientsByMeal.get(m.id) || [],
		tags: tagsByMeal.get(m.id) || [],
	}));

	// 6. Batch vector lookup: collect ingredient names that need fallback, call findSimilarCargoBatch once
	const missNames = new Set<string>();
	for (const { ingredients } of enrichedMeals) {
		for (const ing of ingredients) {
			const normalized = normalizeIngredientName(ing.ingredientName);
			if (!cargoIndex.has(normalized)) {
				missNames.add(ing.ingredientName);
			}
		}
	}
	const similarityMap =
		missNames.size > 0
			? await findSimilarCargoBatch(
					env,
					organizationId,
					Array.from(missNames),
					{
						topK: 3,
						threshold: SIMILARITY_THRESHOLDS.MEAL_MATCH,
					},
				)
			: new Map<string, SimilarCargoMatch[]>();

	// 7. Compute per-meal scale factors (servings override applies uniformly when given)
	const getScaleForMeal = (mealRecord: typeof meal.$inferSelect) => {
		if (!servings) return 1;
		return getScaleFactor(mealRecord.servings ?? 1, servings);
	};

	// 8. Perform matching based on mode (sync — uses pre-fetched similarity map)
	let results: MealMatchResult[];
	if (mode === "strict") {
		if (servings) {
			const allResults: MealMatchResult[] = [];
			for (const enriched of enrichedMeals) {
				const sf = getScaleForMeal(enriched.meal);
				allResults.push(
					...strictMatch([enriched], cargoIndex, similarityMap, sf),
				);
			}
			results = allResults;
		} else {
			results = strictMatch(enrichedMeals, cargoIndex, similarityMap);
		}
	} else if (servings) {
		const allResults: MealMatchResult[] = [];
		for (const enriched of enrichedMeals) {
			const sf = getScaleForMeal(enriched.meal);
			allResults.push(
				...deltaMatch([enriched], cargoIndex, similarityMap, minMatch, sf),
			);
		}
		results = allResults.sort((a, b) => b.matchPercentage - a.matchPercentage);
	} else {
		results = deltaMatch(enrichedMeals, cargoIndex, similarityMap, minMatch);
	}

	// 9. Apply limit
	const limited = results.slice(0, limit);

	// 10. Store in KV cache for repeat visits (60s TTL)
	if (env.RATION_KV) {
		const cacheKey = getMatchCacheKey(organizationId, query);
		try {
			await env.RATION_KV.put(cacheKey, JSON.stringify(limited), {
				expirationTtl: MATCH_CACHE_TTL,
			});
		} catch {
			// Cache write failed; non-fatal
		}
	}

	return limited;
}

const MATCH_CACHE_PREFIX = "match:";
const MATCH_CACHE_TTL = 60; // seconds

/**
 * Generates a cache key for meal matching results
 */
export function getMatchCacheKey(
	organizationId: string,
	query: MealMatchQuery,
): string {
	const { mode, minMatch = 50, limit = 20, preLimit, tag, servings } = query;
	return `${MATCH_CACHE_PREFIX}${organizationId}:${mode}:${minMatch}:${limit}:${preLimit ?? "none"}:${tag || "all"}:${servings ?? "base"}`;
}
