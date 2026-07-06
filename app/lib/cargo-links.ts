import { normalizeForCargoDedup } from "./matching";

export type CargoLinkRow = { id: string; name: string; tags?: unknown };

export type CargoLinkedIngredient<
	T extends { ingredientName: string; cargoId?: string | null },
> = T & { resolvedCargoId?: string };

/**
 * Resolves a cargo detail id for an ingredient name using the same
 * normalisation as inventory matching.
 */
export function resolveCargoIdForName(
	name: string,
	rows: CargoLinkRow[],
): string | null {
	const normalized = normalizeForCargoDedup(name);
	for (const row of rows) {
		if (normalizeForCargoDedup(row.name) === normalized) {
			return row.id;
		}
	}
	return null;
}

/** Prefer explicit meal_ingredient link, then name resolution. */
export function resolveIngredientCargoId(
	ingredient: { ingredientName: string; cargoId?: string | null },
	rows: CargoLinkRow[],
): string | null {
	if (ingredient.cargoId) return ingredient.cargoId;
	return resolveCargoIdForName(ingredient.ingredientName, rows);
}

export function enrichIngredientsWithCargoLinks<
	T extends { ingredientName: string; cargoId?: string | null },
>(ingredients: T[], rows: CargoLinkRow[]): CargoLinkedIngredient<T>[] {
	return ingredients.map((ing) => {
		const resolvedCargoId = resolveIngredientCargoId(ing, rows) ?? undefined;
		return resolvedCargoId ? { ...ing, resolvedCargoId } : { ...ing };
	});
}
