/**
 * Unit-portion helpers for Cargo → provision promote and Quick Eat.
 *
 * Provisions must store one edible portion as meal_ingredient.quantity with
 * meal.servings = 1 — never the full pantry stock — so cook scaling deducts
 * N portions rather than emptying the bag.
 */

import {
	convertQuantity,
	normalizeUnitAlias,
	type SupportedUnit,
	toSupportedUnit,
} from "~/lib/units";

const STOCK_SHAPE_RELATIVE_EPS = 0.05;
const STOCK_SHAPE_ABS_EPS = 0.01;

/**
 * Canonical edible portion size in the cargo item's unit.
 * Mass/volume use household-scale defaults so cook/intake servings stay in a
 * sensible range (intake accepts 0.5–100 servings).
 */
export function resolveProvisionUnitPortion(unit: SupportedUnit): number {
	switch (unit) {
		case "unit":
		case "piece":
		case "dozen":
		case "bunch":
		case "clove":
		case "slice":
		case "head":
		case "stalk":
		case "sprig":
		case "can":
		case "pack":
			return 1;
		case "g":
			return 100;
		case "kg":
			return 0.1;
		case "oz":
			return 4;
		case "lb":
			return 0.25;
		case "ml":
			return 100;
		case "l":
			return 0.1;
		default:
			return 1;
	}
}

export function resolveProvisionUnitPortionFromRaw(
	unitRaw: string | null | undefined,
): { quantity: number; unit: SupportedUnit } {
	const unit = normalizeUnitAlias(unitRaw);
	return { quantity: resolveProvisionUnitPortion(unit), unit };
}

export type StockShapedInput = {
	mealServings: number;
	ingredientQuantity: number;
	ingredientUnit: string;
	cargoQuantity: number;
	cargoUnit: string;
};

/**
 * True when a linked provision looks like a legacy “full stock as one serving”
 * promote (ingredient qty ≈ current cargo qty, and larger than a unit portion).
 * Also treats emptied cargo (qty ≈ 0) with an oversized ingredient as stock-shaped.
 */
export function isStockShapedProvision(input: StockShapedInput): boolean {
	if (!Number.isFinite(input.mealServings) || input.mealServings !== 1) {
		return false;
	}
	if (
		!Number.isFinite(input.ingredientQuantity) ||
		input.ingredientQuantity <= 0
	) {
		return false;
	}

	const ingredientUnit = toSupportedUnit(input.ingredientUnit);
	const cargoUnit = toSupportedUnit(input.cargoUnit);

	const unitPortion = resolveProvisionUnitPortion(ingredientUnit);
	if (input.ingredientQuantity <= unitPortion * 1.5) {
		return false;
	}

	const cargoInIngredientUnit = convertQuantity(
		input.cargoQuantity,
		cargoUnit,
		ingredientUnit,
	);
	if (cargoInIngredientUnit == null) {
		return false;
	}

	if (cargoInIngredientUnit <= STOCK_SHAPE_ABS_EPS) {
		// Pantry emptied after a stock-dump promote — still normalize.
		return true;
	}

	const delta = Math.abs(input.ingredientQuantity - cargoInIngredientUnit);
	const tol = Math.max(
		STOCK_SHAPE_ABS_EPS,
		cargoInIngredientUnit * STOCK_SHAPE_RELATIVE_EPS,
	);
	return delta <= tol;
}

/**
 * How many meal servings to cook/log for a requested cargo amount,
 * given the provision's unit-portion ingredient row.
 */
export function cookServingsForCargoAmount(input: {
	requestedQuantity: number;
	requestedUnit: string;
	ingredientQuantity: number;
	ingredientUnit: string;
}): number | null {
	if (
		!Number.isFinite(input.requestedQuantity) ||
		input.requestedQuantity <= 0 ||
		!Number.isFinite(input.ingredientQuantity) ||
		input.ingredientQuantity <= 0
	) {
		return null;
	}
	const from = toSupportedUnit(input.requestedUnit);
	const to = toSupportedUnit(input.ingredientUnit);
	const converted = convertQuantity(input.requestedQuantity, from, to);
	if (converted == null) return null;
	const servings = converted / input.ingredientQuantity;
	if (!Number.isFinite(servings) || servings <= 0) return null;
	return servings;
}

/** Clamp plate-up servings to nutrition intake schema bounds. */
export function clampIntakeServings(cookServings: number): {
	servings: number;
	clamped: boolean;
} {
	const MIN = 0.5;
	const MAX = 100;
	if (cookServings < MIN) {
		return { servings: MIN, clamped: true };
	}
	if (cookServings > MAX) {
		return { servings: MAX, clamped: true };
	}
	return { servings: cookServings, clamped: false };
}
