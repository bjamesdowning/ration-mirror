import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { inventory, meal, mealIngredient, mealTag } from "../db/schema";

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
 * Builds an inventory lookup map for efficient matching.
 * Groups inventory by normalized name with total quantities.
 */
function buildInventoryIndex(items: (typeof inventory.$inferSelect)[]) {
	const index = new Map<
		string,
		{
			original: typeof inventory.$inferSelect;
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
 * Calculates the total available quantity for a given ingredient name.
 * Handles fuzzy matching via normalized names.
 */
function getAvailableQuantity(
	ingredientName: string,
	inventoryIndex: ReturnType<typeof buildInventoryIndex>,
): number {
	const normalized = normalizeIngredientName(ingredientName);
	const matches = inventoryIndex.get(normalized);

	if (!matches || matches.length === 0) {
		return 0;
	}

	// Sum all matching inventory items
	return matches.reduce((sum, match) => sum + match.totalQuantity, 0);
}

/**
 * Performs strict matching: only returns meals where ALL non-optional
 * ingredients are available in sufficient quantity.
 */
function strictMatch(
	meals: Array<{
		meal: typeof meal.$inferSelect;
		ingredients: (typeof mealIngredient.$inferSelect)[];
		tags: string[];
	}>,
	inventoryIndex: ReturnType<typeof buildInventoryIndex>,
): MealMatchResult[] {
	const results: MealMatchResult[] = [];

	for (const { meal: mealData, ingredients, tags } of meals) {
		const availableIngredients: IngredientMatch[] = [];
		const missingIngredients: MissingIngredient[] = [];

		for (const ingredient of ingredients) {
			const available = getAvailableQuantity(
				ingredient.ingredientName,
				inventoryIndex,
			);
			const required = ingredient.quantity;

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
 */
function deltaMatch(
	meals: Array<{
		meal: typeof meal.$inferSelect;
		ingredients: (typeof mealIngredient.$inferSelect)[];
		tags: string[];
	}>,
	inventoryIndex: ReturnType<typeof buildInventoryIndex>,
	minMatch: number = 50,
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
			const available = getAvailableQuantity(
				ingredient.ingredientName,
				inventoryIndex,
			);
			const required = ingredient.quantity;
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
 * Fetches meals and inventory, then performs matching based on mode.
 */
export async function matchMeals(
	db: D1Database,
	organizationId: string,
	query: MealMatchQuery,
): Promise<MealMatchResult[]> {
	const d1 = drizzle(db);
	const { mode, minMatch = 50, limit = 20, tag } = query;

	console.log("[matchMeals] Starting with params:", {
		organizationId,
		mode,
		minMatch,
		limit,
		tag,
	});

	// 1. Fetch organization's meals (with optional tag filter)
	const mealQuery = tag
		? d1
				.select({
					id: meal.id,
					organizationId: meal.organizationId,
					name: meal.name,
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
	console.log("[matchMeals] Found meals:", meals.length);

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
		mealIds.length > 0
			? d1
					.select()
					.from(mealIngredient)
					.where(inArray(mealIngredient.mealId, mealIds))
			: Promise.resolve([]),
		mealIds.length > 0
			? d1.select().from(mealTag).where(inArray(mealTag.mealId, mealIds))
			: Promise.resolve([]),
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

	// 3. Fetch organization's current inventory
	const orgInventory = await d1
		.select()
		.from(inventory)
		.where(eq(inventory.organizationId, organizationId));

	// 4. Build inventory index for efficient lookups
	const inventoryIndex = buildInventoryIndex(orgInventory);

	// 5. Combine meal data with ingredients and tags
	const enrichedMeals = meals.map((m) => ({
		meal: m,
		ingredients: ingredientsByMeal.get(m.id) || [],
		tags: tagsByMeal.get(m.id) || [],
	}));

	// 6. Perform matching based on mode
	let results: MealMatchResult[];
	if (mode === "strict") {
		results = strictMatch(enrichedMeals, inventoryIndex);
	} else {
		results = deltaMatch(enrichedMeals, inventoryIndex, minMatch);
	}

	// 7. Apply limit
	return results.slice(0, limit);
}

/**
 * Generates a cache key for meal matching results
 */
export function getMatchCacheKey(
	organizationId: string,
	query: MealMatchQuery,
): string {
	const { mode, minMatch = 50, limit = 20, tag } = query;
	return `match:${organizationId}:${mode}:${minMatch}:${limit}:${tag || "all"}`;
}
