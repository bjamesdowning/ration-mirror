import { describe, expect, it } from "vitest";
import type { MealMatchQuery } from "~/lib/matching.server";
import {
	buildCargoIndex,
	getMatchCacheKey,
	strictMatch,
} from "~/lib/matching.server";

// ---------------------------------------------------------------------------
// getMatchCacheKey — tag normalisation
// ---------------------------------------------------------------------------

describe("getMatchCacheKey — tags field", () => {
	const base: MealMatchQuery = {
		mode: "delta",
		minMatch: 50,
		limit: 6,
		preLimit: 12,
		type: "recipe",
		domain: "food",
	};

	it("produces 'all' tag segment when tags is absent", () => {
		const key = getMatchCacheKey("org-1", base);
		expect(key).toContain(":all:");
	});

	it("encodes a single-tag array correctly", () => {
		const key = getMatchCacheKey("org-1", { ...base, tags: ["dinner"] });
		expect(key).toContain(":dinner:");
	});

	it("encodes multiple tags as a sorted '+'-joined segment", () => {
		const keyUnsorted = getMatchCacheKey("org-1", {
			...base,
			tags: ["snack", "dinner"],
		});
		const keySorted = getMatchCacheKey("org-1", {
			...base,
			tags: ["dinner", "snack"],
		});
		// Both orderings must produce the same key
		expect(keyUnsorted).toBe(keySorted);
		expect(keyUnsorted).toContain(":dinner+snack:");
	});

	it("accepts a legacy string tag for backward compatibility", () => {
		const key = getMatchCacheKey("org-1", { ...base, tags: "dinner" });
		expect(key).toContain(":dinner:");
	});

	it("produces 'all' when tags is an empty array", () => {
		const key = getMatchCacheKey("org-1", { ...base, tags: [] });
		expect(key).toContain(":all:");
	});

	it("different tag sets produce different cache keys", () => {
		const keyA = getMatchCacheKey("org-1", { ...base, tags: ["dinner"] });
		const keyB = getMatchCacheKey("org-1", { ...base, tags: ["lunch"] });
		expect(keyA).not.toBe(keyB);
	});

	it("different orgs produce different cache keys for same query", () => {
		const key1 = getMatchCacheKey("org-1", base);
		const key2 = getMatchCacheKey("org-2", base);
		expect(key1).not.toBe(key2);
	});
});

// ---------------------------------------------------------------------------
// buildCargoIndex — unchanged baseline (regression guard)
// ---------------------------------------------------------------------------

describe("buildCargoIndex", () => {
	it("groups items by normalised name", () => {
		const cargo = [
			{ id: "1", name: "Olive Oil", quantity: 1, unit: "l", domain: "food" },
			{ id: "2", name: "olive oil", quantity: 0.5, unit: "l", domain: "food" },
		];
		const index = buildCargoIndex(cargo);
		// Both entries normalise to the same key
		const entries = index.get("olive oil");
		expect(entries).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// strictMatch — with pre-built cargo index and similarity map
// ---------------------------------------------------------------------------

describe("strictMatch", () => {
	// Helper: build a minimal mock meal row that satisfies the type
	const makeMeal = (id: string) => ({
		id,
		organizationId: "org-1",
		name: `Meal ${id}`,
		domain: "food",
		type: "recipe",
		description: null,
		directions: null,
		equipment: null,
		servings: 2,
		prepTime: 10,
		cookTime: 20,
		customFields: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	const makeIngredient = (
		mealId: string,
		name: string,
		quantity: number,
		unit: string,
		isOptional = false,
	) => ({
		id: `${mealId}-${name}`,
		mealId,
		cargoId: null,
		ingredientName: name,
		quantity,
		unit,
		isOptional,
		orderIndex: 0,
	});

	it("includes a meal when all required ingredients are available", () => {
		const cargo = [
			{ id: "c1", name: "pasta", quantity: 500, unit: "g", domain: "food" },
			{
				id: "c2",
				name: "tomato sauce",
				quantity: 200,
				unit: "ml",
				domain: "food",
			},
		];
		const index = buildCargoIndex(cargo);
		const similarityMap = new Map();

		const enrichedMeals = [
			{
				meal: makeMeal("m1"),
				ingredients: [
					makeIngredient("m1", "pasta", 200, "g"),
					makeIngredient("m1", "tomato sauce", 100, "ml"),
				],
				tags: ["dinner"],
			},
		];

		const results = strictMatch(enrichedMeals, index, similarityMap);
		expect(results).toHaveLength(1);
		expect(results[0].canMake).toBe(true);
		expect(results[0].matchPercentage).toBe(100);
	});

	it("excludes a meal when a required ingredient is missing", () => {
		const cargo = [
			{ id: "c1", name: "pasta", quantity: 500, unit: "g", domain: "food" },
		];
		const index = buildCargoIndex(cargo);
		const similarityMap = new Map();

		const enrichedMeals = [
			{
				meal: makeMeal("m2"),
				ingredients: [
					makeIngredient("m2", "pasta", 200, "g"),
					makeIngredient("m2", "truffle oil", 50, "ml"), // not in cargo
				],
				tags: ["dinner"],
			},
		];

		const results = strictMatch(enrichedMeals, index, similarityMap);
		expect(results).toHaveLength(0);
	});

	it("includes a meal when the only missing ingredient is optional", () => {
		const cargo = [
			{ id: "c1", name: "pasta", quantity: 500, unit: "g", domain: "food" },
		];
		const index = buildCargoIndex(cargo);
		const similarityMap = new Map();

		const enrichedMeals = [
			{
				meal: makeMeal("m3"),
				ingredients: [
					makeIngredient("m3", "pasta", 200, "g"),
					makeIngredient("m3", "truffle oil", 50, "ml", true), // optional — missing is ok
				],
				tags: ["dinner"],
			},
		];

		const results = strictMatch(enrichedMeals, index, similarityMap);
		expect(results).toHaveLength(1);
		expect(results[0].canMake).toBe(true);
	});

	it("returns empty array when enrichedMeals list is empty", () => {
		const index = buildCargoIndex([]);
		const results = strictMatch([], index, new Map());
		expect(results).toHaveLength(0);
	});
});
