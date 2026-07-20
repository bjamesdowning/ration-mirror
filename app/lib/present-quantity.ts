import {
	decomposeSubUnits,
	formatQuantity,
	formatQuantityNumericString,
	snapEpsilon,
} from "./format-quantity";
import { lookupDensity } from "./ingredient-density";
import type { UnitDisplayMode } from "./unit-display-mode";
import {
	chooseReadableUnitForMode,
	convertIngredientAmount,
	convertQuantity,
	getUnitFamily,
	getUnitMultiplier,
	type SupportedUnit,
	toCookingUnit,
	toShoppingUnit,
	toSupportedUnit,
} from "./units";

export type PresentQuantityContext =
	| "cargo"
	| "recipe"
	| "supply"
	| "availability"
	| "merge"
	| "scan";

export type PresentQuantityConfidence = "exact" | "converted" | "estimated";

export interface PresentQuantityInput {
	quantity: number;
	unit: string;
	ingredientName?: string | null;
	mode?: UnitDisplayMode;
	context?: PresentQuantityContext;
}

export interface PresentQuantityResult {
	quantity: number;
	unit: SupportedUnit;
	formatted: string;
	confidence: PresentQuantityConfidence;
	tooltip?: string;
	usedDensity: boolean;
}

function isCrossFamilyConversion(
	from: SupportedUnit,
	to: SupportedUnit,
): boolean {
	if (from === to) return false;
	return getUnitMultiplier(from, to) === null;
}

function applyReadableUnit(
	quantity: number,
	unit: SupportedUnit,
	mode: UnitDisplayMode,
): { quantity: number; unit: SupportedUnit } {
	const readableMode = mode === "original" ? "metric" : mode;
	const family = getUnitFamily(unit);
	if (family === "weight_metric") {
		const grams = convertQuantity(quantity, unit, "g");
		if (grams === null) return { quantity, unit };
		return chooseReadableUnitForMode(grams, "g", readableMode);
	}
	if (family === "weight_imperial") {
		const oz = convertQuantity(quantity, unit, "oz");
		if (oz === null) return { quantity, unit };
		return chooseReadableUnitForMode(oz, "oz", readableMode);
	}
	if (family === "volume") {
		const ml = convertQuantity(quantity, unit, "ml");
		if (ml === null) return { quantity, unit };
		return chooseReadableUnitForMode(ml, "ml", readableMode);
	}
	return { quantity, unit };
}

function transformForMode(
	quantity: number,
	unit: SupportedUnit,
	ingredientName: string,
	mode: UnitDisplayMode,
): {
	quantity: number;
	unit: SupportedUnit;
	confidence: PresentQuantityConfidence;
	tooltip?: string;
	usedDensity: boolean;
} {
	if (mode === "original") {
		return {
			quantity,
			unit,
			confidence: "exact",
			usedDensity: false,
		};
	}

	const name = ingredientName || "ingredient";

	if (mode === "cooking") {
		const result = toCookingUnit(quantity, unit, name);
		const usedDensity =
			result.unit !== unit &&
			isCrossFamilyConversion(unit, result.unit) &&
			lookupDensity(name) != null;
		return {
			quantity: result.quantity,
			unit: result.unit,
			confidence: usedDensity ? "converted" : "exact",
			tooltip: usedDensity
				? `Converted using ingredient density for ${name}`
				: undefined,
			usedDensity,
		};
	}

	const result = toShoppingUnit(quantity, unit, name, mode);
	const usedDensity =
		result.unit !== unit &&
		isCrossFamilyConversion(unit, result.unit) &&
		lookupDensity(name) != null;
	const hasDensity = lookupDensity(name) != null;
	const confidence: PresentQuantityConfidence = usedDensity
		? hasDensity
			? "converted"
			: "estimated"
		: "exact";

	return {
		quantity: result.quantity,
		unit: result.unit,
		confidence,
		tooltip:
			usedDensity && hasDensity
				? `Converted using ingredient density for ${name} (±5–10%)`
				: usedDensity
					? `Estimated conversion using default density for ${name}*`
					: undefined,
		usedDensity,
	};
}

/**
 * Unified presentation pipeline for all quantity display surfaces.
 * Converts to the user's display mode, picks readable units, snaps float
 * artifacts, and formats with kitchen fractions.
 */
export function presentQuantity(
	input: PresentQuantityInput,
): PresentQuantityResult {
	const sourceUnit = toSupportedUnit(input.unit);
	const sourceQty = input.quantity;
	const mode = input.mode ?? "metric";
	const ingredientName = input.ingredientName?.trim() || "ingredient";

	const transformed = transformForMode(
		sourceQty,
		sourceUnit,
		ingredientName,
		mode,
	);

	const readable =
		mode === "original"
			? { quantity: snapEpsilon(transformed.quantity), unit: transformed.unit }
			: applyReadableUnit(transformed.quantity, transformed.unit, mode);

	const finalQty = snapEpsilon(readable.quantity);
	const finalUnit = readable.unit;

	const decomposed = decomposeSubUnits(finalQty, finalUnit);
	let formattedCore = decomposed ?? formatQuantity(finalQty, finalUnit);

	// Shopping display: integer grams when ≥ 5 g
	if (
		(mode === "metric" || mode === "imperial") &&
		finalUnit === "g" &&
		finalQty >= 5
	) {
		formattedCore = `${Math.round(finalQty)} g`;
	}
	// Imperial shopping: nearest 0.25 oz below 10
	if (mode === "imperial" && finalUnit === "oz" && finalQty < 10) {
		const quarter = Math.round(finalQty * 4) / 4;
		formattedCore = formatQuantity(quarter, "oz");
	}

	const prefix =
		transformed.confidence !== "exact" && mode !== "original" ? "≈" : "";
	const suffix = transformed.confidence === "estimated" ? "*" : "";
	const formatted = `${prefix}${formattedCore}${suffix}`;

	return {
		quantity: finalQty,
		unit: finalUnit,
		formatted,
		confidence: transformed.confidence,
		tooltip: transformed.tooltip,
		usedDensity: transformed.usedDensity,
	};
}

/** Numeric-only presentation (forms, tables) without unit suffix. */
export function presentQuantityNumeric(input: PresentQuantityInput): string {
	const result = presentQuantity(input);
	return formatQuantityNumericString(result.quantity, result.unit);
}

/** Whether two units can be merged/compared for an ingredient (density-aware). */
export function areIngredientUnitsCompatible(
	unitA: string,
	unitB: string,
	ingredientName: string,
): boolean {
	const a = toSupportedUnit(unitA);
	const b = toSupportedUnit(unitB);
	if (getUnitMultiplier(a, b) !== null) return true;
	return (
		convertIngredientAmount(1, a, b, ingredientName) !== null ||
		convertIngredientAmount(1, b, a, ingredientName) !== null
	);
}

/** Convert quantity between units for merge/dedup (density-aware). */
export function convertForIngredient(
	quantity: number,
	from: string,
	to: string,
	ingredientName: string,
): number | null {
	return convertIngredientAmount(
		quantity,
		toSupportedUnit(from),
		toSupportedUnit(to),
		ingredientName,
	);
}
