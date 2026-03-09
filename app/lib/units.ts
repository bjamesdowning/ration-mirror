import { isLikelyLiquidIngredient, lookupDensity } from "./ingredient-density";

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
export type SupplyUnitMode = "cooking" | "metric" | "imperial";

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

function toGrams(quantity: number, unit: SupportedUnit): number | null {
	if (unit === "g") return quantity;
	if (unit === "kg") return quantity * 1000;
	if (unit === "oz") return quantity / OZ_PER_G;
	if (unit === "lb") return (quantity * 16) / OZ_PER_G;
	return null;
}

function fromGramsToWeightFamily(
	grams: number,
	target: SupportedUnit,
): number | null {
	if (target === "g") return grams;
	if (target === "kg") return grams / 1000;
	if (target === "oz") return grams * OZ_PER_G;
	if (target === "lb") return (grams * OZ_PER_G) / 16;
	return null;
}

function isWeightUnit(unit: SupportedUnit): boolean {
	const family = getUnitFamily(unit);
	return family === "weight_metric" || family === "weight_imperial";
}

function chooseMetricVolumeUnit(quantityMl: number): {
	quantity: number;
	unit: SupportedUnit;
} {
	if (quantityMl >= 1000) {
		return { quantity: quantityMl / 1000, unit: "l" };
	}
	return { quantity: quantityMl, unit: "ml" };
}

export function getUnitMultiplier(
	from: SupportedUnit,
	to: SupportedUnit,
): number | null {
	if (from === to) return 1;
	if (!areSameFamily(from, to)) {
		// Bridge metric <-> imperial weight (e.g. g <-> oz, kg <-> lb)
		if (isWeightUnit(from) && isWeightUnit(to)) {
			const fromInGrams = toGrams(1, from);
			if (fromInGrams === null) return null;
			const converted = fromGramsToWeightFamily(fromInGrams, to);
			return converted;
		}
		return null;
	}

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

/** Weight unit families for cross-family conversion */
const WEIGHT_FAMILIES = new Set<UnitFamily>([
	"weight_metric",
	"weight_imperial",
]);
/** Volume unit family */
const VOLUME_FAMILY: UnitFamily = "volume";

/** Grams per US fluid ounce (29.5735 ml). */
const G_PER_FL_OZ = 29.5735;
/** Ounces per gram (1/28.3495). */
const OZ_PER_G = 1 / 28.3495;

/**
 * Converts between weight and volume using ingredient density (g/ml).
 * Use when convertQuantity returns null due to cross-family (weight ↔ volume).
 *
 * @param quantity - Amount in the source unit
 * @param from - Source unit (must be weight or volume)
 * @param to - Target unit (must be the opposite family: volume if from is weight, weight if from is volume)
 * @param densityGPerMl - Ingredient density in g/ml (from lookupDensity)
 * @returns Converted quantity, or null if units are same family or invalid
 */
export function convertQuantityWithDensity(
	quantity: number,
	from: SupportedUnit,
	to: SupportedUnit,
	densityGPerMl: number,
): number | null {
	const fromFamily = getUnitFamily(from);
	const toFamily = getUnitFamily(to);

	if (fromFamily === toFamily) return null;
	if (densityGPerMl <= 0 || !Number.isFinite(densityGPerMl)) return null;

	let grams: number;

	if (WEIGHT_FAMILIES.has(fromFamily)) {
		// Source is weight -> convert to grams
		if (from === "g") grams = quantity;
		else if (from === "kg") grams = quantity * 1000;
		else if (from === "oz") grams = quantity / OZ_PER_G;
		else if (from === "lb") grams = (quantity * 16) / OZ_PER_G;
		else return null;

		// Target is volume -> grams / density = ml, then ml -> target unit
		if (to === "ml") return grams / densityGPerMl;
		if (to === "l") return grams / densityGPerMl / 1000;
		if (to === "tsp") return grams / densityGPerMl / 4.92892;
		if (to === "tbsp") return grams / densityGPerMl / 14.7868;
		if (to === "fl oz") return grams / densityGPerMl / G_PER_FL_OZ;
		if (to === "cup") return grams / densityGPerMl / 236.588;
		if (to === "pt") return grams / densityGPerMl / 473.176;
		if (to === "qt") return grams / densityGPerMl / 946.353;
		if (to === "gal") return grams / densityGPerMl / 3785.41;
		return null;
	}

	if (fromFamily === VOLUME_FAMILY) {
		// Source is volume -> convert to ml, then ml * density = grams
		const ml =
			from === "ml"
				? quantity
				: from === "l"
					? quantity * 1000
					: from === "tsp"
						? quantity * 4.92892
						: from === "tbsp"
							? quantity * 14.7868
							: from === "fl oz"
								? quantity * G_PER_FL_OZ
								: from === "cup"
									? quantity * 236.588
									: from === "pt"
										? quantity * 473.176
										: from === "qt"
											? quantity * 946.353
											: from === "gal"
												? quantity * 3785.41
												: NaN;
		if (!Number.isFinite(ml)) return null;
		grams = ml * densityGPerMl;

		// Target is weight -> grams -> target unit
		if (to === "g") return grams;
		if (to === "kg") return grams / 1000;
		if (to === "oz") return grams * OZ_PER_G;
		if (to === "lb") return (grams * OZ_PER_G) / 16;
		return null;
	}

	return null;
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

export function toShoppingUnit(
	quantity: number,
	unit: SupportedUnit,
	ingredientName: string,
	mode: Exclude<SupplyUnitMode, "cooking"> = "metric",
): { quantity: number; unit: SupportedUnit } {
	if (mode === "imperial") {
		if (isWeightUnit(unit)) {
			const oz = convertQuantity(quantity, unit, "oz");
			if (oz !== null) return chooseReadableUnit(oz, "oz");
		}
	}

	if (mode === "metric") {
		if (isWeightUnit(unit)) {
			const grams = convertQuantity(quantity, unit, "g");
			if (grams !== null) return chooseReadableUnit(grams, "g");
		}
	}

	const family = getUnitFamily(unit);
	if (family !== "volume") {
		return { quantity, unit };
	}

	const volumeInMl = convertQuantity(quantity, unit, "ml");
	if (volumeInMl === null) return { quantity, unit };

	// Liquids are typically bought by volume. Keep them in metric/imperial volume.
	if (isLikelyLiquidIngredient(ingredientName)) {
		if (mode === "metric") return chooseMetricVolumeUnit(volumeInMl);
		return chooseReadableUnit(volumeInMl, "ml");
	}

	// Solids measured by volume (e.g. cups of rice) are better shown by weight.
	const density = lookupDensity(ingredientName);
	if (!density) {
		return mode === "metric"
			? chooseMetricVolumeUnit(volumeInMl)
			: chooseReadableUnit(volumeInMl, "ml");
	}

	const grams = convertQuantityWithDensity(quantity, unit, "g", density);
	if (grams === null) {
		return mode === "metric"
			? chooseMetricVolumeUnit(volumeInMl)
			: chooseReadableUnit(volumeInMl, "ml");
	}

	if (mode === "imperial") {
		const ounces = convertQuantity(grams, "g", "oz");
		if (ounces !== null) return chooseReadableUnit(ounces, "oz");
	}
	return chooseReadableUnit(grams, "g");
}

export function toCookingUnit(
	quantity: number,
	unit: SupportedUnit,
	ingredientName: string,
): { quantity: number; unit: SupportedUnit } {
	const family = getUnitFamily(unit);
	if (family === "volume" || !isWeightUnit(unit)) {
		return { quantity, unit };
	}

	if (isLikelyLiquidIngredient(ingredientName)) {
		// Keep liquids in purchase units to avoid awkward "cups of oil" toggles.
		return { quantity, unit };
	}

	const density = lookupDensity(ingredientName);
	if (!density) return { quantity, unit };

	const volumeInMl = convertQuantityWithDensity(quantity, unit, "ml", density);
	if (volumeInMl === null) return { quantity, unit };
	return chooseReadableUnit(volumeInMl, "ml");
}
