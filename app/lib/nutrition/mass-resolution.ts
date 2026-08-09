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

/** Stub hook for FDC portion-based mass (Slice 5 — wired when portion DB lands). */
export function resolveMassFromFdcPortion(
	_fdcId: number,
	_portionDescription?: string | null,
): MassResolutionResult {
	return {
		grams: null,
		method: "fdc_portion",
		confidence: 0,
		estimated: true,
	};
}
