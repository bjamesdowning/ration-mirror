import { gramsFromLoggedMass } from "./intake-amount";

/**
 * Household measures for a personal food log.
 * Gram weights come from stored portion rows. This module does not invent one.
 * Typed macros are returned unchanged.
 */
export type StoredGramPortion = {
	unit: string;
	/** Grams covering `amount` of this unit. Null means the measure is not usable. */
	gramWeight: number | null;
	/** How many of `unit` that gram weight covers. Missing or invalid means 1. */
	amount?: number | null;
};

export type PortionMacros = {
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
};

export type HouseholdPortionSuccess = {
	ok: true;
	kind: "typed" | "scaled";
	macros: PortionMacros;
	grams: number | null;
};

export type HouseholdPortionFailure = {
	ok: false;
	code: "amount_unit_unavailable";
	allowedUnits: string[];
	message: string;
};

const MASS_UNITS = ["g", "oz"] as const;

function normalizedUnit(unit: string): string {
	return unit.trim().toLowerCase();
}

function hasStoredGrams(portion: StoredGramPortion): boolean {
	return (
		portion.gramWeight != null &&
		Number.isFinite(portion.gramWeight) &&
		portion.gramWeight > 0
	);
}

/** Units this food can scale. Mass is always available. Household units need a stored gram weight. */
export function unitsFromStoredGramWeights(
	portions: readonly StoredGramPortion[],
): string[] {
	const units: string[] = [...MASS_UNITS];
	for (const portion of portions) {
		const unit = normalizedUnit(portion.unit);
		if (!unit || unit === "g" || unit === "oz" || !hasStoredGrams(portion)) {
			continue;
		}
		if (!units.includes(unit)) units.push(unit);
	}
	return units;
}

function scalePer100g(per100g: PortionMacros, grams: number): PortionMacros {
	const factor = grams / 100;
	return {
		energyKcal: per100g.energyKcal * factor,
		proteinG: per100g.proteinG * factor,
		carbsG: per100g.carbsG * factor,
		fatG: per100g.fatG * factor,
		fiberG: per100g.fiberG == null ? null : per100g.fiberG * factor,
	};
}

function gramsFromStoredPortion(
	portion: StoredGramPortion,
	requestedAmount: number,
): number | null {
	if (!hasStoredGrams(portion)) return null;
	const basis =
		portion.amount != null &&
		Number.isFinite(portion.amount) &&
		portion.amount > 0
			? portion.amount
			: 1;
	return ((portion.gramWeight as number) / basis) * requestedAmount;
}

export function storedPortionFromFdc(row: {
	portionDescription: string | null;
	measureUnit: string | null;
	gramWeight: number | null;
	amount: number | null;
}): StoredGramPortion | null {
	const unit = (row.measureUnit || row.portionDescription || "").trim();
	if (!unit) return null;
	const gramWeight =
		row.gramWeight != null && Number.isFinite(row.gramWeight)
			? row.gramWeight
			: null;
	return { unit, gramWeight, amount: row.amount };
}

function unavailable(
	unit: string,
	allowedUnits: string[],
): HouseholdPortionFailure {
	const list =
		allowedUnits.length > 0 ? allowedUnits.join(", ") : "typed macros";
	return {
		ok: false,
		code: "amount_unit_unavailable",
		allowedUnits,
		message: `${unit} is not available for this food. Use ${list}.`,
	};
}

/**
 * Typed macros skip conversion. Otherwise scale per 100 g from a stored gram
 * weight. A household unit with no gram weight is rejected.
 */
export function resolveHouseholdPortion(input: {
	amount?: number | null;
	unit?: string | null;
	macros?: PortionMacros | null;
	per100g?: PortionMacros | null;
	portions?: readonly StoredGramPortion[];
}): HouseholdPortionSuccess | HouseholdPortionFailure {
	if (input.macros) {
		return { ok: true, kind: "typed", macros: input.macros, grams: null };
	}
	const unit = normalizedUnit(input.unit ?? "");
	const amount = input.amount ?? null;
	const portions = input.portions ?? [];
	const allowedUnits = unitsFromStoredGramWeights(portions);
	if (!input.per100g || amount == null || amount <= 0 || !unit) {
		return unavailable(unit || "that unit", allowedUnits);
	}
	if (unit === "g" || unit === "oz") {
		const grams = gramsFromLoggedMass(amount, unit);
		if (grams == null || grams <= 0) return unavailable(unit, allowedUnits);
		return {
			ok: true,
			kind: "scaled",
			macros: scalePer100g(input.per100g, grams),
			grams,
		};
	}
	const stored = portions.find(
		(portion) =>
			normalizedUnit(portion.unit) === unit && hasStoredGrams(portion),
	);
	const grams = stored ? gramsFromStoredPortion(stored, amount) : null;
	if (!stored || grams == null || grams <= 0) {
		return unavailable(unit, allowedUnits);
	}
	return {
		ok: true,
		kind: "scaled",
		macros: scalePer100g(input.per100g, grams),
		grams,
	};
}
