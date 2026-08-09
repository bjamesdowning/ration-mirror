import {
	convertQuantity,
	getUnitFamily,
	type SupportedUnit,
} from "~/lib/units";
import { convertIngredientAmountToGrams } from "./scale-nutrients";
import type { MassResolutionResult } from "./types";

export type ResolveIngredientMassOptions = {
	/** Caller-supplied grams (e.g. meal ingredient precomputed mass). */
	explicitGrams?: number | null;
	/**
	 * Food-nutrition path: never use assumed 1 g/ml; count units need FDC portion.
	 * Package-scale / cargo quantity edits may leave this false.
	 */
	forNutrition?: boolean;
	/** Grams from a matched FDC portion (`gramWeight / amount * quantity`). */
	fdcPortionGrams?: number | null;
	fdcPortionConfidence?: number;
};

/**
 * Quality-aware mass resolver for nutrition scaling.
 * Pure / isomorphic — safe for Cargo edit and scan review clients.
 */
export function resolveIngredientMass(
	quantity: number | null | undefined,
	unit: SupportedUnit | null | undefined,
	name: string,
	opts?: ResolveIngredientMassOptions,
): MassResolutionResult {
	const explicit = opts?.explicitGrams;
	if (explicit != null && Number.isFinite(explicit) && explicit > 0) {
		return {
			grams: explicit,
			method: "explicit",
			confidence: 1,
			estimated: false,
		};
	}

	if (quantity == null || unit == null) {
		return unknownMass();
	}
	if (!Number.isFinite(quantity) || quantity <= 0) {
		return unknownMass();
	}

	const family = getUnitFamily(unit);

	if (family === "weight_metric" || family === "weight_imperial") {
		const grams = convertIngredientAmountToGrams(quantity, unit, name);
		if (grams != null && grams > 0) {
			return {
				grams,
				method: "direct_mass",
				confidence: 1,
				estimated: false,
			};
		}
		return unknownMass();
	}

	if (family === "volume") {
		const denseGrams = convertIngredientAmountToGrams(quantity, unit, name);
		if (denseGrams != null && denseGrams > 0) {
			return {
				grams: denseGrams,
				method: "density",
				confidence: 0.85,
				estimated: true,
			};
		}

		if (opts?.forNutrition) {
			return unknownMass();
		}

		const ml = convertQuantity(quantity, unit, "ml");
		if (ml != null && Number.isFinite(ml) && ml > 0) {
			return {
				grams: ml,
				method: "assumed_1g_ml",
				confidence: 0.35,
				estimated: true,
			};
		}
		return unknownMass();
	}

	const portionGrams = opts?.fdcPortionGrams;
	if (
		portionGrams != null &&
		Number.isFinite(portionGrams) &&
		portionGrams > 0
	) {
		return {
			grams: portionGrams,
			method: "fdc_portion",
			confidence: opts?.fdcPortionConfidence ?? 0.9,
			estimated: false,
		};
	}

	return unknownMass();
}

/** Convenience: grams only (legacy callers). */
export function gramsFromMassResolution(
	quantity: number | null | undefined,
	unit: SupportedUnit | null | undefined,
	name: string,
	opts?: ResolveIngredientMassOptions,
): number | null {
	return resolveIngredientMass(quantity, unit, name, opts).grams;
}

function unknownMass(): MassResolutionResult {
	return {
		grams: null,
		method: "unknown",
		confidence: 0,
		estimated: true,
	};
}

/**
 * Apply FDC portion grams when present (pure helper for async portion lookup).
 * @deprecated Prefer {@link resolveIngredientMass} with `fdcPortionGrams`.
 */
export function resolveMassFromFdcPortion(
	_fdcId: number,
	_portionDescription?: string | null,
	gramsPerUnit?: number | null,
	quantity = 1,
): MassResolutionResult {
	if (
		gramsPerUnit == null ||
		!Number.isFinite(gramsPerUnit) ||
		gramsPerUnit <= 0 ||
		!Number.isFinite(quantity) ||
		quantity <= 0
	) {
		return {
			grams: null,
			method: "fdc_portion",
			confidence: 0,
			estimated: true,
		};
	}
	return {
		grams: gramsPerUnit * quantity,
		method: "fdc_portion",
		confidence: 0.9,
		estimated: false,
	};
}
