import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cargo, meal, mealIngredient, mealTag } from "../db/schema";
import { log, redactId } from "./logging.server";
import { normalizeForMatch, tokenMatchScore } from "./matching";
import { chunkedQuery } from "./query-utils.server";
import { getScaleFactor, scaleQuantity } from "./scale.server";
import { convertQuantity, type SupportedUnit, toSupportedUnit } from "./units";
export { normalizeForMatch, tokenMatchScore };

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
 */
function sumConvertedToTarget(
	matches: {
		original: typeof cargo.$inferSelect;
		totalQuantity: number;
		normalizedName: string;
	}[],
	targetUnit: SupportedUnit,
): number {
	let total = 0;
	for (const match of matches) {
		const fromUnit = toSupportedUnit(match.original.unit);
		const converted = convertQuantity(
			match.totalQuantity,
			fromUnit,
			targetUnit,
		);
		if (converted !== null) total += converted;
	}
	return total;
}

/**
 * Calculates the total available quantity for a given ingredient name in the ingredient's unit.
 * Handles fuzzy matching and unit conversion.
 */
function getAvailableQuantity(
	ingredientName: string,
	targetUnit: SupportedUnit,
	cargoIndex: ReturnType<typeof buildCargoIndex>,
): number {
	const normalized = normalizeIngredientName(ingredientName);
	const matches = cargoIndex.get(normalized);

	if (!matches || matches.length === 0) {
		let bestMatches:
			| {
					original: typeof cargo.$inferSelect;
					totalQuantity: number;
					normalizedName: string;
			  }[]
			| null = null;
		let bestScore = 0;

		for (const [key, bucket] of cargoIndex) {
			const score = tokenMatchScore(ingredientName, key);
			if (score >= 0.8 && score > bestScore) {
				bestScore = score;
				bestMatches = bucket;
			}
		}

		if (!bestMatches) return 0;

		return sumConvertedToTarget(bestMatches, targetUnit);
	}

	return sumConvertedToTarget(matches, targetUnit);
}

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
	scaleFactor = 1,
): MealMatchResult[] {
	const results: MealMatchResult[] = [];

	for (const { meal: mealData, ingredients, tags } of meals) {
		const availableIngredients: IngredientMatch[] = [];
		const missingIngredients: MissingIngredient[] = [];

		for (const ingredient of ingredients) {
			const targetUnit = toSupportedUnit(ingredient.unit);
			const available = getAvailableQuantity(
				ingredient.ingredientName,
				targetUnit,
				cargoIndex,
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
			const available = getAvailableQuantity(
				ingredient.ingredientName,
				targetUnit,
				cargoIndex,
			);
			const required = scaleQuantity(
				ingredient.quantity,
				scaleFactor,
				ingredient.unit,
			);
			totalIngredients++;

			if (available >= required) {
				availableCount++;
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

		const matchPercentage = Math.round(
			(availableCount / totalIngredients) * 100,
		);

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
	db: D1Database,
	organizationId: string,
	query: MealMatchQuery,
): Promise<MealMatchResult[]> {
	const d1 = drizzle(db);
	const { mode, minMatch = 50, limit = 20, tag, servings } = query;

	log.info("[matchMeals] Starting", {
		organizationId: redactId(organizationId),
		mode,
		minMatch,
		limit,
		tag,
		servings,
	});

	// 1. Fetch organization's meals (with optional tag filter)
	const mealQuery = tag
		? d1
				.select({
					id: meal.id,
					organizationId: meal.organizationId,
					name: meal.name,
					domain: meal.domain,
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

	// 6. Compute per-meal scale factors (servings override applies uniformly when given)
	// Each meal carries its own base servings so scaling is independent per recipe.
	const getScaleForMeal = (mealRecord: typeof meal.$inferSelect) => {
		if (!servings) return 1;
		return getScaleFactor(mealRecord.servings ?? 1, servings);
	};

	// 7. Perform matching based on mode
	// When a global servings override is supplied we scale per meal; otherwise scale=1.
	let results: MealMatchResult[];
	if (mode === "strict") {
		if (servings) {
			// Scale each meal individually
			const allResults: MealMatchResult[] = [];
			for (const enriched of enrichedMeals) {
				const sf = getScaleForMeal(enriched.meal);
				allResults.push(...strictMatch([enriched], cargoIndex, sf));
			}
			results = allResults;
		} else {
			results = strictMatch(enrichedMeals, cargoIndex);
		}
	} else if (servings) {
		const allResults: MealMatchResult[] = [];
		for (const enriched of enrichedMeals) {
			const sf = getScaleForMeal(enriched.meal);
			allResults.push(...deltaMatch([enriched], cargoIndex, minMatch, sf));
		}
		results = allResults.sort((a, b) => b.matchPercentage - a.matchPercentage);
	} else {
		results = deltaMatch(enrichedMeals, cargoIndex, minMatch);
	}

	// 8. Apply limit
	return results.slice(0, limit);
}

/**
 * Generates a cache key for meal matching results
 */
export function getMatchCacheKey(
	organizationId: string,
	query: MealMatchQuery,
): string {
	const { mode, minMatch = 50, limit = 20, tag, servings } = query;
	return `match:${organizationId}:${mode}:${minMatch}:${limit}:${tag || "all"}:${servings ?? "base"}`;
}
