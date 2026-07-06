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
	const normalized = input.itemName.toLowerCase().trim();
	const cargoMatch = input.cargoRows.find(
		(row) => row.name.toLowerCase().trim() === normalized,
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
