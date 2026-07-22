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
 * Inputs that intentionally mean count `unit` (no unknown-unit warning).
 * Other strings that coerce to `unit` are treated as unrecognized.
 */
const INTENTIONAL_COUNT_UNIT_INPUTS = new Set(["unit", "units"]);

export type CoerceToolUnitResult = {
	unit: SupportedUnit;
	/** Present when the trimmed lowercase input differed from the canonical unit. */
	normalizedFrom?: string;
	/** Present when a non-empty unrecognized unit fell back to count `unit`. */
	warning?: string;
};

/**
 * Coerces tool/agent unit args via aliases, with optional feedback for agents.
 * Prefer this over toSupportedUnit on MCP/Copilot write tool boundaries.
 */
export function coerceToolUnit(
	raw: string | null | undefined,
): CoerceToolUnitResult {
	const trimmed = String(raw ?? "").trim();
	const normalizedKey = trimmed.toLowerCase().replace(/\s+/g, " ");
	const unit = normalizeUnitAlias(raw);
	const result: CoerceToolUnitResult = { unit };

	const isUnrecognizedCountFallback =
		unit === "unit" &&
		normalizedKey.length > 0 &&
		!INTENTIONAL_COUNT_UNIT_INPUTS.has(normalizedKey);

	if (isUnrecognizedCountFallback) {
		result.warning = `Unrecognized unit "${trimmed}" was stored as "unit". Prefer SI symbols (g, kg, ml, l) or read ration://units for aliases.`;
	} else if (normalizedKey && normalizedKey !== unit) {
		result.normalizedFrom = normalizedKey;
	}

	return result;
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

/** Metric shopping volume: liters above 1 L, otherwise milliliters. */
export function chooseReadableMetricVolume(quantityMl: number): {
	quantity: number;
	unit: SupportedUnit;
} {
	if (quantityMl >= 1000) {
		return { quantity: quantityMl / 1000, unit: "l" };
	}
	return { quantity: quantityMl, unit: "ml" };
}

/** Imperial / cooking volume ladder (US customary + kitchen measures). */
export function chooseReadableImperialVolume(quantityMl: number): {
	quantity: number;
	unit: SupportedUnit;
} {
	if (quantityMl >= 3785.41) {
		return { quantity: quantityMl / 3785.41, unit: "gal" };
	}
	if (quantityMl >= 946.353) {
		return { quantity: quantityMl / 946.353, unit: "qt" };
	}
	if (quantityMl >= 473.176) {
		return { quantity: quantityMl / 473.176, unit: "pt" };
	}
	if (quantityMl >= 236.588) {
		return { quantity: quantityMl / 236.588, unit: "cup" };
	}
	if (quantityMl >= 29.5735) {
		return { quantity: quantityMl / 29.5735, unit: "fl oz" };
	}
	if (quantityMl >= 14.7868) {
		return { quantity: quantityMl / 14.7868, unit: "tbsp" };
	}
	if (quantityMl >= 4.92892) {
		return { quantity: quantityMl / 4.92892, unit: "tsp" };
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

/**
 * Canonical ingredient-aware unit conversion used by ALL product surfaces
 * (matching, cook deduction, supply sync).
 *
 * Decision order:
 *   1. Same-family / cross-weight-family conversion via `convertQuantity`.
 *   2. Cross-family weight ↔ volume conversion via density lookup + `convertQuantityWithDensity`.
 *   3. Returns `null` only when conversion is genuinely impossible.
 *
 * This is the ONLY function that should be used for ingredient quantity
 * conversions in business logic. Direct calls to `convertQuantity`,
 * `getUnitMultiplier`, or `convertQuantityWithDensity` should be limited to
 * low-level helpers that are called exclusively from this function or from
 * display/formatting utilities.
 *
 * @param quantity - Source quantity
 * @param from - Source unit (will be treated as-is; normalize before calling)
 * @param to - Target unit
 * @param ingredientName - Ingredient name for density lookup (optional but
 *   required for weight ↔ volume cross-family conversion)
 * @returns Converted quantity in the target unit, or null if not convertible
 */
export function convertIngredientAmount(
	quantity: number,
	from: SupportedUnit,
	to: SupportedUnit,
	ingredientName?: string | null,
): number | null {
	// Step 1: same-family + cross-weight-family (metric ↔ imperial)
	const direct = convertQuantity(quantity, from, to);
	if (direct !== null) return direct;

	// Step 2: cross-family weight ↔ volume via density
	if (!ingredientName) return null;
	const density = lookupDensity(ingredientName);
	if (!density) return null;
	return convertQuantityWithDensity(quantity, from, to, density);
}

export function convertFromBaseUnit(
	baseQuantity: number,
	baseUnit: BaseUnit,
	targetUnit: SupportedUnit,
): number | null {
	if (getBaseUnit(targetUnit) !== baseUnit) return null;
	return baseQuantity / getFactorToBase(targetUnit);
}

/**
 * Same-family readable scaling. Volume uses the imperial/cooking ladder.
 * Prefer {@link chooseReadableUnitForMode} when a display mode is known —
 * that helper also bridges metric ↔ imperial weight families.
 */
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
		return chooseReadableImperialVolume(baseQuantity);
	}

	return { quantity: baseQuantity, unit: baseUnit };
}

/**
 * Picks a human-readable unit within the user's display system.
 * Metric volumes stay on l/ml; imperial/cooking use the US volume ladder.
 * Weight bases are converted into the mode's weight family when needed.
 */
export function chooseReadableUnitForMode(
	baseQuantity: number,
	baseUnit: BaseUnit,
	mode: SupplyUnitMode | "original" = "metric",
): { quantity: number; unit: SupportedUnit } {
	if (baseUnit === "g") {
		if (mode === "imperial") {
			const oz = convertQuantity(baseQuantity, "g", "oz");
			if (oz !== null) {
				return chooseReadableUnit(oz, "oz");
			}
		}
		return chooseReadableUnit(baseQuantity, "g");
	}

	if (baseUnit === "oz") {
		if (mode === "metric") {
			const grams = convertQuantity(baseQuantity, "oz", "g");
			if (grams !== null) {
				return chooseReadableUnit(grams, "g");
			}
		}
		return chooseReadableUnit(baseQuantity, "oz");
	}

	if (baseUnit === "ml") {
		if (mode === "metric") {
			return chooseReadableMetricVolume(baseQuantity);
		}
		// imperial, cooking, original → US / kitchen volume ladder
		return chooseReadableImperialVolume(baseQuantity);
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
		if (mode === "metric") return chooseReadableMetricVolume(volumeInMl);
		return chooseReadableUnit(volumeInMl, "ml");
	}

	// Solids measured by volume (e.g. cups of rice) are better shown by weight.
	const density = lookupDensity(ingredientName);
	if (!density) {
		return mode === "metric"
			? chooseReadableMetricVolume(volumeInMl)
			: chooseReadableUnit(volumeInMl, "ml");
	}

	const grams = convertQuantityWithDensity(quantity, unit, "g", density);
	if (grams === null) {
		return mode === "metric"
			? chooseReadableMetricVolume(volumeInMl)
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
