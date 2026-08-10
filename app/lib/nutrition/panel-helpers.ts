import { emptyNutrients } from "./scale-nutrients";
import type {
	MealNutritionSnapshot,
	NutrientValues,
	NutritionSnapshot,
	NutritionSource,
} from "./types";

/** Conversion factor: 1 kcal = 4.184 kJ. */
export const KJ_PER_KCAL = 4.184;

export type ProvenanceLabel = "USDA" | "AI Estimate" | "Override" | "Blank";

/** Which nutrient block Cargo is displaying. */
export type CargoNutritionBasisLabel = "Package" | "Per 100 g";

export function kcalToKj(kcal: number): number {
	return kcal * KJ_PER_KCAL;
}

export function isMealNutritionSnapshot(
	nutrition: MealNutritionSnapshot | NutritionSnapshot,
): nutrition is MealNutritionSnapshot {
	return (
		"coverage" in nutrition &&
		"attributions" in nutrition &&
		"computedAt" in nutrition
	);
}

export function provenanceLabel(
	source: NutritionSource | null | undefined,
	hasValues: boolean,
): ProvenanceLabel {
	if (!hasValues || !source) return "Blank";
	switch (source) {
		case "usda":
			return "USDA";
		case "ai_estimate":
			return "AI Estimate";
		case "user_override":
			return "Override";
		default:
			return "Blank";
	}
}

/**
 * Cargo display basis: package/line totals (`perServing`) preferred over density.
 * Matches {@link getDisplayNutrients} for mode `"cargo"`.
 */
export function cargoNutritionBasisLabel(
	nutrition: NutritionSnapshot | null | undefined,
): CargoNutritionBasisLabel | null {
	if (!nutrition) return null;
	if (nutrition.perServing != null) return "Package";
	if (nutrition.per100g != null) return "Per 100 g";
	return null;
}

/** Panel subtitle for meal vs cargo. */
export function nutritionPanelBasisSuffix(
	nutrition: MealNutritionSnapshot | NutritionSnapshot | null,
	mode: "meal" | "cargo",
): string | null {
	if (mode === "meal") return "Per recipe serving";
	if (nutrition && isMealNutritionSnapshot(nutrition)) {
		return "Per recipe serving";
	}
	return cargoNutritionBasisLabel(
		nutrition && !isMealNutritionSnapshot(nutrition) ? nutrition : null,
	);
}

export function formatCoveragePercent(coverage: number): string {
	const pct = Math.round(Math.max(0, Math.min(1, coverage)) * 100);
	return `${pct}%`;
}

/** Prefer per-serving; cargo falls back to per-100g. */
export function getDisplayNutrients(
	nutrition: MealNutritionSnapshot | NutritionSnapshot | null,
	mode: "meal" | "cargo",
): NutrientValues | null {
	if (!nutrition) return null;
	if (isMealNutritionSnapshot(nutrition)) {
		return nutrition.perServing;
	}
	if (mode === "meal") {
		return nutrition.perServing;
	}
	return nutrition.perServing ?? nutrition.per100g;
}

export type MacroPatch = Partial<
	Pick<NutrientValues, "energyKcal" | "proteinG" | "fatG" | "carbG">
>;

/**
 * Apply editable macro fields; always marks provenance as user_override + verified.
 */
export function applyUserOverrideToSnapshot(
	prev: NutritionSnapshot | null,
	patch: MacroPatch,
): NutritionSnapshot {
	const base = prev?.perServing ?? prev?.per100g ?? emptyNutrients();
	const nextValues: NutrientValues = {
		...base,
		energyKcal: patch.energyKcal ?? base.energyKcal,
		proteinG: patch.proteinG ?? base.proteinG,
		fatG: patch.fatG ?? base.fatG,
		carbG: patch.carbG ?? base.carbG,
	};
	return {
		source: "user_override",
		confidence: 1,
		verified: true,
		// Clear prior density so package totals re-derive per100g on save/scale.
		per100g: null,
		perServing: nextValues,
		fdcId: prev?.fdcId ?? null,
		description: prev?.description ?? null,
	};
}

export function blankCargoNutritionSnapshot(): NutritionSnapshot {
	return {
		source: "user_override",
		confidence: 1,
		verified: true,
		per100g: null,
		perServing: emptyNutrients(),
		fdcId: null,
		description: null,
	};
}
