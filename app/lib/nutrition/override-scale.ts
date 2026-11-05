import { normalizeForCargoDedup } from "~/lib/matching";
import {
	getUnitFamily,
	isDiscreteCountFamily,
	type SupportedUnit,
} from "~/lib/units";
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
 * Macros iOS uses to recover grams per counted unit (`CountUnitMass.storedGramsPerUnit`).
 * Energy first, then protein, carb, and fat.
 */
const COUNT_UNIT_MASS_KEYS = [
	"energyKcal",
	"proteinG",
	"carbG",
	"fatG",
] as const;

/**
 * Same band iOS uses when a saved gram weight is "the same" (`shouldPersist`, 0.5 g),
 * widened to 1% so a large unit still agrees after normal rounding.
 */
const COUNT_UNIT_GRAMS_ABSOLUTE_TOLERANCE = 0.5;
const COUNT_UNIT_GRAMS_RELATIVE_TOLERANCE = 0.01;

function countUnitGramsAgree(reference: number, candidate: number): boolean {
	const diff = Math.abs(reference - candidate);
	const tolerance = Math.max(
		COUNT_UNIT_GRAMS_ABSOLUTE_TOLERANCE,
		Math.abs(reference) * COUNT_UNIT_GRAMS_RELATIVE_TOLERANCE,
	);
	return diff <= tolerance;
}

/**
 * Grams per one count unit when every present macro implies the same weight.
 *
 * A zero density beside a positive portion is a disagreement and returns null.
 * That keeps a contradictory snapshot (42 kcal and 1 g protein against 10 kcal
 * per 100 g) on `perServing` instead of inventing 420 g. Both sides zero, or a
 * missing side, is not a ratio and is skipped.
 */
export function agreedGramsPerCountUnit(
	per100g: NutrientsPer100g,
	perServing: NutrientValues,
): number | null {
	let grams: number | null = null;
	for (const key of COUNT_UNIT_MASS_KEYS) {
		const density = per100g[key];
		const portion = perServing[key];
		if (density == null || portion == null) continue;
		if (!Number.isFinite(density) || !Number.isFinite(portion)) continue;
		if (density === 0 && portion === 0) continue;
		if (density <= 0 || portion <= 0) return null;
		const implied = (portion / density) * 100;
		if (!Number.isFinite(implied) || implied <= 0) return null;
		if (grams == null) {
			grams = implied;
			continue;
		}
		if (!countUnitGramsAgree(grams, implied)) return null;
	}
	return grams;
}

/**
 * Ingredient grams for a count line whose per-serving macros match per-100 g.
 * `perServing` is one pantry unit (the iOS mass link), so quantity scales it.
 */
export function agreedCountUnitPortionGrams(
	per100g: NutrientsPer100g,
	perServing: NutrientValues,
	quantity: number,
): number | null {
	const perUnit = agreedGramsPerCountUnit(per100g, perServing);
	if (perUnit == null || !Number.isFinite(quantity) || quantity <= 0) {
		return null;
	}
	const grams = perUnit * quantity;
	if (!Number.isFinite(grams) || grams <= 0) return null;
	return grams;
}

/**
 * Infer portion mass from household `perServing` vs density `per100g` (energy ratio).
 * Used when count units cannot convert to grams directly.
 */
export function estimateGramsFromPerServingDensity(
	per100g: NutrientsPer100g,
	perServing: NutrientValues,
	portions: number,
): number | null {
	if (!Number.isFinite(portions) || portions <= 0) return null;
	const e100 = per100g.energyKcal;
	const eServ = perServing.energyKcal;
	if (
		e100 == null ||
		eServ == null ||
		!Number.isFinite(e100) ||
		!Number.isFinite(eServ) ||
		e100 <= 0 ||
		eServ <= 0
	) {
		return null;
	}
	const gramsPerPortion = (eServ / e100) * 100;
	if (!Number.isFinite(gramsPerPortion) || gramsPerPortion <= 0) return null;
	return gramsPerPortion * portions;
}

/**
 * Direct nutrients for a count-unit meal ingredient when mass is unknown.
 * Treats cargo `perServing` as nutrients per package count unit; for
 * user_override package totals without per100g, divides by package quantity.
 */
export function directNutrientsFromCountCargoOverride(
	snapshot: NutritionSnapshot,
	ingredientQuantity: number,
	ingredientUnit: SupportedUnit | null | undefined,
	packageQuantity: number,
	packageUnit: SupportedUnit | null | undefined,
): NutrientValues | null {
	if (
		!ingredientUnit ||
		!isDiscreteCountFamily(getUnitFamily(ingredientUnit)) ||
		!Number.isFinite(ingredientQuantity) ||
		ingredientQuantity <= 0
	) {
		return null;
	}
	if (packageUnit && !isDiscreteCountFamily(getUnitFamily(packageUnit))) {
		return null;
	}

	const perServing = snapshot.perServing;
	if (!perServing) return null;
	const energy = perServing.energyKcal;
	if (energy == null || !Number.isFinite(energy)) return null;

	const isPackageTotals =
		snapshot.per100g == null &&
		(snapshot.source === "user_override" ||
			snapshot.source === "ai_estimate") &&
		Number.isFinite(packageQuantity) &&
		packageQuantity > 0;

	const perUnitFactor = isPackageTotals ? 1 / packageQuantity : 1;
	return scaleNutrientValues(perServing, ingredientQuantity * perUnitFactor);
}

const COUNT_UNIT_PER_SERVING_WARNING =
	"per-100 g was not used; count-unit rollup used perServing";

/**
 * Count-unit user overrides.
 *
 * When every present macro agrees, return null so the caller keeps the gram
 * weight and scales with per-100 g. A contradictory per-100 g block still
 * rolls up `perServing` and warns, so density cannot invent grams.
 */
export function resolveCountUnitMealContribution(input: {
	snapshot: NutritionSnapshot;
	ingredientQuantity: number;
	ingredientUnit: SupportedUnit | null | undefined;
	packageQuantity: number;
	packageUnit: SupportedUnit | null | undefined;
}): { directContribution: NutrientValues; warning: string | null } | null {
	if (input.snapshot.source !== "user_override" || !input.snapshot.perServing) {
		return null;
	}
	const directContribution = directNutrientsFromCountCargoOverride(
		input.snapshot,
		input.ingredientQuantity,
		input.ingredientUnit,
		input.packageQuantity,
		input.packageUnit,
	);
	if (!directContribution) return null;
	if (
		input.snapshot.per100g &&
		agreedGramsPerCountUnit(
			input.snapshot.per100g,
			input.snapshot.perServing,
		) != null
	) {
		return null;
	}
	return {
		directContribution,
		warning: input.snapshot.per100g ? COUNT_UNIT_PER_SERVING_WARNING : null,
	};
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
