const UNIT_FACTORS_TO_BASE = {
	// Weight (metric)
	kg: { family: "weight_metric", baseUnit: "g", factor: 1000 },
	g: { family: "weight_metric", baseUnit: "g", factor: 1 },
	// Weight (imperial)
	lb: { family: "weight_imperial", baseUnit: "oz", factor: 16 },
	oz: { family: "weight_imperial", baseUnit: "oz", factor: 1 },
	// Volume (single family, base ml - metric + US customary)
	ml: { family: "volume", baseUnit: "ml", factor: 1 },
	l: { family: "volume", baseUnit: "ml", factor: 1000 },
	tsp: { family: "volume", baseUnit: "ml", factor: 4.92892 },
	tbsp: { family: "volume", baseUnit: "ml", factor: 14.7868 },
	"fl oz": { family: "volume", baseUnit: "ml", factor: 29.5735 },
	cup: { family: "volume", baseUnit: "ml", factor: 236.588 },
	pt: { family: "volume", baseUnit: "ml", factor: 473.176 },
	qt: { family: "volume", baseUnit: "ml", factor: 946.353 },
	gal: { family: "volume", baseUnit: "ml", factor: 3785.41 },
	// Count
	unit: { family: "count_unit", baseUnit: "unit", factor: 1 },
	piece: { family: "count_unit", baseUnit: "unit", factor: 1 },
	dozen: { family: "count_unit", baseUnit: "unit", factor: 12 },
	bunch: { family: "count_unit", baseUnit: "unit", factor: 1 },
	clove: { family: "count_unit", baseUnit: "unit", factor: 1 },
	slice: { family: "count_unit", baseUnit: "unit", factor: 1 },
	head: { family: "count_unit", baseUnit: "unit", factor: 1 },
	stalk: { family: "count_unit", baseUnit: "unit", factor: 1 },
	sprig: { family: "count_unit", baseUnit: "unit", factor: 1 },
	can: { family: "count_can", baseUnit: "can", factor: 1 },
	pack: { family: "count_pack", baseUnit: "pack", factor: 1 },
} as const;

export type SupportedUnit = keyof typeof UNIT_FACTORS_TO_BASE;
export type UnitFamily = (typeof UNIT_FACTORS_TO_BASE)[SupportedUnit]["family"];
export type BaseUnit = (typeof UNIT_FACTORS_TO_BASE)[SupportedUnit]["baseUnit"];

/** Canonical list of supported units for schemas and UI */
export const SUPPORTED_UNITS = Object.keys(
	UNIT_FACTORS_TO_BASE,
) as unknown as SupportedUnit[];

const SUPPORTED_UNIT_KEYS = new Set<string>(
	Object.keys(UNIT_FACTORS_TO_BASE) as SupportedUnit[],
);

const UNIT_ALIASES: Record<string, SupportedUnit> = {
	cups: "cup",
	tablespoon: "tbsp",
	tablespoons: "tbsp",
	teaspoon: "tsp",
	teaspoons: "tsp",
	"fl oz": "fl oz",
	"fluid ounce": "fl oz",
	"fluid ounces": "fl oz",
	liter: "l",
	liters: "l",
	litre: "l",
	litres: "l",
	milliliter: "ml",
	milliliters: "ml",
	millilitre: "ml",
	millilitres: "ml",
	gram: "g",
	grams: "g",
	kilogram: "kg",
	kilograms: "kg",
	ounce: "oz",
	ounces: "oz",
	pound: "lb",
	pounds: "lb",
	lbs: "lb",
	pint: "pt",
	pints: "pt",
	quart: "qt",
	quarts: "qt",
	gallon: "gal",
	gallons: "gal",
	pieces: "piece",
	units: "unit",
	dozens: "dozen",
	cans: "can",
	packs: "pack",
	bunches: "bunch",
	cloves: "clove",
	slices: "slice",
	heads: "head",
	stalks: "stalk",
	sprigs: "sprig",
};

/**
 * Normalizes a raw unit string (e.g. from AI/import) via aliases first, then falls
 * back to toSupportedUnit. Use before persistence for user/AI-entered units.
 */
export function normalizeUnitAlias(
	raw: string | null | undefined,
): SupportedUnit {
	const u = String(raw ?? "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
	const aliased = UNIT_ALIASES[u];
	if (aliased) return aliased;
	return toSupportedUnit(raw);
}

/**
 * Coerces a raw unit string (e.g. from DB) to SupportedUnit. Unknown/empty values
 * return "unit" so callers never pass an invalid key into UNIT_FACTORS_TO_BASE.
 */
export function toSupportedUnit(raw: string | null | undefined): SupportedUnit {
	const u = String(raw ?? "")
		.trim()
		.toLowerCase();
	if (u && SUPPORTED_UNIT_KEYS.has(u)) return u as SupportedUnit;
	return "unit";
}

export function getUnitFamily(unit: SupportedUnit): UnitFamily {
	return UNIT_FACTORS_TO_BASE[unit].family;
}

export function areSameFamily(a: SupportedUnit, b: SupportedUnit): boolean {
	return getUnitFamily(a) === getUnitFamily(b);
}

export function normalizeToBaseUnit(
	quantity: number,
	unit: SupportedUnit,
): {
	quantity: number;
	unit: BaseUnit;
	family: UnitFamily;
} {
	const mapping = UNIT_FACTORS_TO_BASE[unit];
	return {
		quantity: quantity * mapping.factor,
		unit: mapping.baseUnit,
		family: mapping.family,
	};
}

function getFactorToBase(unit: SupportedUnit): number {
	return UNIT_FACTORS_TO_BASE[unit].factor;
}

function getBaseUnit(unit: SupportedUnit): BaseUnit {
	return UNIT_FACTORS_TO_BASE[unit].baseUnit;
}

export function getUnitMultiplier(
	from: SupportedUnit,
	to: SupportedUnit,
): number | null {
	if (from === to) return 1;
	if (!areSameFamily(from, to)) return null;

	const fromFactor = getFactorToBase(from);
	const toFactor = getFactorToBase(to);
	return fromFactor / toFactor;
}

export function convertQuantity(
	quantity: number,
	from: SupportedUnit,
	to: SupportedUnit,
): number | null {
	const multiplier = getUnitMultiplier(from, to);
	if (multiplier === null) return null;
	return quantity * multiplier;
}

export function convertFromBaseUnit(
	baseQuantity: number,
	baseUnit: BaseUnit,
	targetUnit: SupportedUnit,
): number | null {
	if (getBaseUnit(targetUnit) !== baseUnit) return null;
	return baseQuantity / getFactorToBase(targetUnit);
}

export function chooseReadableUnit(
	baseQuantity: number,
	baseUnit: BaseUnit,
): { quantity: number; unit: SupportedUnit } {
	if (baseUnit === "g") {
		if (baseQuantity >= 1000) {
			return { quantity: baseQuantity / 1000, unit: "kg" };
		}
		return { quantity: baseQuantity, unit: "g" };
	}

	if (baseUnit === "oz") {
		if (baseQuantity >= 16) {
			return { quantity: baseQuantity / 16, unit: "lb" };
		}
		return { quantity: baseQuantity, unit: "oz" };
	}

	if (baseUnit === "ml") {
		if (baseQuantity >= 3785.41) {
			return { quantity: baseQuantity / 3785.41, unit: "gal" };
		}
		if (baseQuantity >= 946.353) {
			return { quantity: baseQuantity / 946.353, unit: "qt" };
		}
		if (baseQuantity >= 473.176) {
			return { quantity: baseQuantity / 473.176, unit: "pt" };
		}
		if (baseQuantity >= 236.588) {
			return { quantity: baseQuantity / 236.588, unit: "cup" };
		}
		if (baseQuantity >= 29.5735) {
			return { quantity: baseQuantity / 29.5735, unit: "fl oz" };
		}
		if (baseQuantity >= 14.7868) {
			return { quantity: baseQuantity / 14.7868, unit: "tbsp" };
		}
		if (baseQuantity >= 4.92892) {
			return { quantity: baseQuantity / 4.92892, unit: "tsp" };
		}
		if (baseQuantity >= 1000) {
			return { quantity: baseQuantity / 1000, unit: "l" };
		}
		return { quantity: baseQuantity, unit: "ml" };
	}

	return { quantity: baseQuantity, unit: baseUnit };
}
