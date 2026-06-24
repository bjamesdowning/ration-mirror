export type SupplySortMode = "alpha" | "unpurchased" | "added";

export interface SupplySortableItem {
	name: string;
	isPurchased: boolean;
}

/**
 * Sort supply list items for display. "added" preserves input order (stable).
 */
export function sortSupplyItems<T extends SupplySortableItem>(
	items: T[],
	sortMode: SupplySortMode,
): T[] {
	if (sortMode === "added" || items.length <= 1) {
		return items;
	}

	if (sortMode === "alpha") {
		return [...items].sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
		);
	}

	// unpurchased: not purchased first, then alpha within each group
	return [...items].sort((a, b) => {
		if (a.isPurchased !== b.isPurchased) {
			return a.isPurchased ? 1 : -1;
		}
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	});
}
