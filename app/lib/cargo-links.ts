import { isTokenPhaseMatch, normalizeForCargoDedup } from "./matching";
import type { TagRecord } from "./tags";

export type CargoLinkRow = { id: string; name: string; tags?: TagRecord[] };

export type CargoLinkedIngredient<
	T extends { ingredientName: string; cargoId?: string | null },
> = T & { resolvedCargoId?: string };

/**
 * Resolves a cargo detail id for an ingredient name using the same
 * normalisation as inventory matching, then token-phase specialization.
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
	for (const row of rows) {
		if (isTokenPhaseMatch(name, row.name)) {
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
