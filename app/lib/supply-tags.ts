/**
 * Resolves display tags for supply list rows at read time (cargo match + meal fallback).
 */
export function parseTagsField(tags: unknown): string[] {
	if (Array.isArray(tags)) {
		return tags.filter((t): t is string => typeof t === "string");
	}
	if (typeof tags === "string") {
		try {
			const parsed = JSON.parse(tags) as unknown;
			return Array.isArray(parsed)
				? parsed.filter((t): t is string => typeof t === "string")
				: [];
		} catch {
			return [];
		}
	}
	return [];
}

export function resolveSupplyItemTags(input: {
	itemName: string;
	cargoRows: Array<{ name: string; tags: unknown }>;
	mealTagsByMealId?: Map<string, string[]>;
	sourceMealIds?: string[];
}): string[] {
	const normalized = input.itemName.toLowerCase().trim();
	const cargoMatch = input.cargoRows.find(
		(row) => row.name.toLowerCase().trim() === normalized,
	);
	if (cargoMatch) {
		const tags = parseTagsField(cargoMatch.tags);
		if (tags.length > 0) return [...new Set(tags)].sort();
	}

	const mealTags = new Set<string>();
	for (const mealId of input.sourceMealIds ?? []) {
		for (const tag of input.mealTagsByMealId?.get(mealId) ?? []) {
			mealTags.add(tag);
		}
	}
	return [...mealTags].sort();
}
