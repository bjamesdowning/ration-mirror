import { normalizeForCargoDedup } from "~/lib/matching";
import type { SupportedUnit } from "~/lib/units";
import {
	convertIngredientAmountToGrams,
	scaleNutrientValues,
} from "./scale-nutrients";
import type {
	NutrientsPer100g,
	NutrientValues,
	NutritionSnapshot,
} from "./types";

export type CargoOverrideCandidate = {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	nutrition: NutritionSnapshot;
	updatedAt: Date | string | number | null;
};

/**
 * Derive per-100g nutrients from a package-total (`perServing`) snapshot.
 * Returns null when package mass is unknown or non-positive.
 */
export function nutrientsPer100gFromPackageTotals(
	packageTotals: NutrientValues,
	packageGrams: number | null | undefined,
): NutrientsPer100g | null {
	if (
		packageGrams == null ||
		!Number.isFinite(packageGrams) ||
		packageGrams <= 0
	) {
		return null;
	}
	return scaleNutrientValues(packageTotals, 100 / packageGrams);
}

/**
 * Prefer stored `per100g`; otherwise derive from package `perServing` + qty/unit.
 */
export function nutrientsPer100gFromCargoOverride(
	snapshot: NutritionSnapshot,
	packageQuantity: number | null | undefined,
	packageUnit: SupportedUnit | null | undefined,
	ingredientName: string,
): NutrientsPer100g | null {
	if (snapshot.per100g) {
		return snapshot.per100g;
	}
	const packageTotals = snapshot.perServing;
	if (!packageTotals) return null;

	const grams =
		packageQuantity != null && packageUnit
			? convertIngredientAmountToGrams(
					packageQuantity,
					packageUnit,
					ingredientName,
				)
			: null;

	return nutrientsPer100gFromPackageTotals(packageTotals, grams);
}

/**
 * Ensure a user_override snapshot has consistent `per100g` when package mass is known.
 */
export function withDerivedPer100g(
	snapshot: NutritionSnapshot,
	packageQuantity: number | null | undefined,
	packageUnit: SupportedUnit | null | undefined,
	name: string,
): NutritionSnapshot {
	if (snapshot.per100g) return snapshot;
	const derived = nutrientsPer100gFromCargoOverride(
		snapshot,
		packageQuantity,
		packageUnit,
		name,
	);
	if (!derived) return snapshot;
	return { ...snapshot, per100g: derived };
}

function updatedAtMs(value: CargoOverrideCandidate["updatedAt"]): number {
	if (value == null) return 0;
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") return value;
	const parsed = Date.parse(String(value));
	return Number.isFinite(parsed) ? parsed : 0;
}

const CARGO_DENSITY_SOURCE_RANK: Record<string, number> = {
	user_override: 0,
	usda: 1,
	ai_estimate: 2,
};

function hasCargoDensity(c: CargoOverrideCandidate): boolean {
	const n = c.nutrition;
	if (!n) return false;
	if (n.per100g != null || n.perServing != null) return true;
	return false;
}

/**
 * Pick the best org cargo density for a meal ingredient.
 * Prefer linked cargoId, then exact dedup-key match.
 * Source order: user_override → usda → ai_estimate.
 */
export function pickBestCargoOverrideForIngredient(
	ingredientName: string,
	candidates: CargoOverrideCandidate[],
	linkedCargoId?: string | null,
): CargoOverrideCandidate | null {
	const usable = candidates.filter(hasCargoDensity);
	if (usable.length === 0) return null;

	const rank = (c: CargoOverrideCandidate) =>
		CARGO_DENSITY_SOURCE_RANK[c.nutrition?.source ?? ""] ?? 99;

	if (linkedCargoId) {
		const linked = usable
			.filter((c) => c.id === linkedCargoId)
			.sort((a, b) => rank(a) - rank(b));
		if (linked[0]) return linked[0];
	}

	const targetKey = normalizeForCargoDedup(ingredientName);
	if (!targetKey) return null;

	const exact = usable.filter(
		(c) => normalizeForCargoDedup(c.name) === targetKey,
	);
	if (exact.length === 0) return null;

	exact.sort((a, b) => {
		const sourceDelta = rank(a) - rank(b);
		if (sourceDelta !== 0) return sourceDelta;
		if (b.quantity !== a.quantity) return b.quantity - a.quantity;
		return updatedAtMs(b.updatedAt) - updatedAtMs(a.updatedAt);
	});
	return exact[0] ?? null;
}
