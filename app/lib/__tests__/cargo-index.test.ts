import { describe, expect, it } from "vitest";
import {
	buildCargoIndex,
	getAvailableQuantityWithMap,
	sumConvertedToTarget,
} from "~/lib/matching.server";
import type { SimilarCargoMatch } from "~/lib/vector.server";
import { createCargoIndexRow } from "~/test/helpers/fixtures";

describe("buildCargoIndex", () => {
	it("groups items by normalised name", () => {
		const items = [
			createCargoIndexRow({ name: "chicken breast", quantity: 500, unit: "g" }),
			createCargoIndexRow({ name: "Chicken Breast", quantity: 300, unit: "g" }),
		];
		const index = buildCargoIndex(items);
		// Both should map to the same normalised key
		expect(index.size).toBe(1);
		const entries = Array.from(index.values())[0];
		expect(entries).toHaveLength(2);
	});

	it("creates separate entries for distinct ingredients", () => {
		const items = [
			createCargoIndexRow({ name: "chicken breast", quantity: 500, unit: "g" }),
			createCargoIndexRow({ name: "broccoli", quantity: 200, unit: "g" }),
		];
		const index = buildCargoIndex(items);
		expect(index.size).toBe(2);
	});

	it("returns empty map for empty input", () => {
		const index = buildCargoIndex([]);
		expect(index.size).toBe(0);
	});

	it("groups regional synonyms together (tinned/canned)", () => {
		const items = [
			createCargoIndexRow({
				name: "tinned tomatoes",
				quantity: 400,
				unit: "g",
			}),
			createCargoIndexRow({
				name: "canned tomatoes",
				quantity: 400,
				unit: "g",
			}),
		];
		const index = buildCargoIndex(items);
		// Both should map to the same "canned tomatoes" key
		expect(index.size).toBe(1);
	});
});

describe("sumConvertedToTarget", () => {
	it("sums same-unit quantities directly", () => {
		const matches = [
			{
				original: createCargoIndexRow({ unit: "g", quantity: 300 }),
				totalQuantity: 300,
				normalizedName: "flour",
			},
			{
				original: createCargoIndexRow({ unit: "g", quantity: 200 }),
				totalQuantity: 200,
				normalizedName: "flour",
			},
		];
		const total = sumConvertedToTarget(matches, "g");
		expect(total).toBe(500);
	});

	it("converts across same family (kg → g)", () => {
		const matches = [
			{
				original: createCargoIndexRow({ unit: "kg", quantity: 1 }),
				totalQuantity: 1,
				normalizedName: "flour",
			},
		];
		const total = sumConvertedToTarget(matches, "g");
		expect(total).toBe(1000);
	});

	it("returns 0 for cross-family without density (g → ml with no ingredientName)", () => {
		const matches = [
			{
				original: createCargoIndexRow({ unit: "g", quantity: 100 }),
				totalQuantity: 100,
				normalizedName: "unknown ingredient",
			},
		];
		const total = sumConvertedToTarget(matches, "ml");
		expect(total).toBe(0);
	});

	it("uses density fallback for cross-family when ingredientName is provided (flour g → cup)", () => {
		const matches = [
			{
				original: createCargoIndexRow({ unit: "g", quantity: 125 }),
				totalQuantity: 125,
				normalizedName: "flour",
			},
		];
		// 125g of flour (density ~0.53 g/ml) ≈ 1 cup (236.588 ml * 0.53 ≈ 125.4g)
		const total = sumConvertedToTarget(matches, "cup", "all purpose flour");
		expect(total).toBeGreaterThan(0);
		expect(total).toBeCloseTo(1, 0);
	});

	it("returns 0 for empty matches", () => {
		expect(sumConvertedToTarget([], "g")).toBe(0);
	});
});

describe("getAvailableQuantityWithMap", () => {
	it("returns available quantity for direct match", () => {
		const items = [
			createCargoIndexRow({ name: "chicken breast", quantity: 500, unit: "g" }),
		];
		const index = buildCargoIndex(items);
		const similarityMap = new Map<string, SimilarCargoMatch[]>();
		const qty = getAvailableQuantityWithMap(
			"chicken breast",
			"g",
			index,
			similarityMap,
		);
		expect(qty).toBe(500);
	});

	it("returns 0 when ingredient is not in index and no similarity matches", () => {
		const index = buildCargoIndex([]);
		const similarityMap = new Map<string, SimilarCargoMatch[]>();
		const qty = getAvailableQuantityWithMap(
			"unicorn meat",
			"g",
			index,
			similarityMap,
		);
		expect(qty).toBe(0);
	});

	it("uses similarity map when direct match fails", () => {
		const items = [
			createCargoIndexRow({ name: "chicken thigh", quantity: 400, unit: "g" }),
		];
		const index = buildCargoIndex(items);
		const similarityMap = new Map<string, SimilarCargoMatch[]>([
			[
				"chicken breast",
				[{ itemId: "x", itemName: "chicken thigh", score: 0.85 }],
			],
		]);
		const qty = getAvailableQuantityWithMap(
			"chicken breast",
			"g",
			index,
			similarityMap,
		);
		expect(qty).toBe(400);
	});

	it("normalises ingredient name for lookup (case-insensitive)", () => {
		const items = [
			createCargoIndexRow({ name: "CHICKEN BREAST", quantity: 300, unit: "g" }),
		];
		const index = buildCargoIndex(items);
		const similarityMap = new Map<string, SimilarCargoMatch[]>();
		const qty = getAvailableQuantityWithMap(
			"chicken breast",
			"g",
			index,
			similarityMap,
		);
		expect(qty).toBe(300);
	});
});
