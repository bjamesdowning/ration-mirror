import { normalizeForCargoDedup } from "./matching";
import type { TagRecord } from "./tags";

/**
 * Resolves display tags for supply list rows at read time (cargo match + meal fallback).
 */
export function resolveSupplyItemTags(input: {
	itemName: string;
	cargoRows: Array<{ name: string; tags?: TagRecord[] }>;
	mealTagsByMealId?: Map<string, string[]>;
	sourceMealIds?: string[];
}): string[] {
	const normalized = normalizeForCargoDedup(input.itemName);
	const cargoMatch = input.cargoRows.find(
		(row) => normalizeForCargoDedup(row.name) === normalized,
	);
	if (cargoMatch) {
		const slugs = (cargoMatch.tags ?? []).map((tag) => tag.slug);
		if (slugs.length > 0) return [...new Set(slugs)].sort();
	}

	const mealTags = new Set<string>();
	for (const mealId of input.sourceMealIds ?? []) {
		for (const slug of input.mealTagsByMealId?.get(mealId) ?? []) {
			mealTags.add(slug);
		}
	}
	return [...mealTags].sort();
}

/**
 * Filters supply rows by cargo tags using the same normalization as cargo links.
 * This module is client-safe, so route components can use it without importing server-only code.
 */
export function filterSupplyItemsByCargoTags<T extends { name: string }>(
	items: T[],
	cargoRows: Array<{ name: string; tags?: TagRecord[] }>,
	supplyTags: string[] | undefined,
): T[] {
	if (!supplyTags?.length) return items;
	const tagSet = new Set(supplyTags);
	const normalizedNamesWithTag = new Set(
		cargoRows
			.filter((row) => row.tags?.some((tag) => tagSet.has(tag.slug)))
			.map((row) => normalizeForCargoDedup(row.name)),
	);
	return items.filter((item) =>
		normalizedNamesWithTag.has(normalizeForCargoDedup(item.name)),
	);
}
