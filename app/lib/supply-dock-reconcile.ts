import { computeBaseFields, effectiveBaseFields } from "./base-quantity";
import { normalizeForCargoDedup } from "./matching";
import {
	hasCargoSupplyOrigin,
	hasMealSupplyOrigin,
} from "./supply-item-origins";
import {
	type BaseUnit,
	chooseReadableUnit,
	convertIngredientAmount,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";

/** Snapshot of a supply row (or scan pair) used after docking. */
export type DockedSupplyItemForReconcile = {
	name: string;
	domain: string;
	quantity: number;
	unit: string;
	baseQuantity: number;
	baseUnit: string;
	sourceCargoId: string | null;
	sourceOrigins: unknown;
};

export type CargoRestockTarget = {
	cargoId: string;
	normalizedName: string;
	domain: string;
	restockBaseQuantity: number;
	restockBaseUnit: BaseUnit;
	cargoDisplayUnit: SupportedUnit;
	cargoName: string;
};

/**
 * How much of a docked row credits toward cargo restock selection fulfillment.
 * Meal/manifest/galley portions are satisfied by post-dock supply resync (pantry gap math).
 * Priority on mixed rows: meal need first, remainder credits cargo restock.
 */
export function computeCargoDockCreditBase(
	item: DockedSupplyItemForReconcile,
	restockTarget: CargoRestockTarget | null,
): number {
	if (!hasCargoSupplyOrigin(item.sourceOrigins)) return 0;

	const lineBase = effectiveBaseFields(
		item.quantity,
		item.unit,
		item.baseQuantity,
		item.baseUnit,
		item.name,
	);
	const dockedBase = lineBase.baseQuantity;
	const lineUnit = toSupportedUnit(lineBase.baseUnit);

	if (!hasMealSupplyOrigin(item.sourceOrigins)) {
		return dockedBase;
	}

	if (!restockTarget) return 0;

	const targetInLineUnit = convertIngredientAmount(
		restockTarget.restockBaseQuantity,
		toSupportedUnit(restockTarget.restockBaseUnit),
		lineUnit,
		item.name,
	);
	if (targetInLineUnit === null) return 0;

	const lineTotal = dockedBase;
	const cargoPortionOnLine = targetInLineUnit;
	const mealPortionOnLine = Math.max(0, lineTotal - cargoPortionOnLine);

	if (lineTotal <= mealPortionOnLine) {
		return 0;
	}

	return Math.min(lineTotal - mealPortionOnLine, cargoPortionOnLine);
}

/** Maps accumulated base credit to a new quantityOverride, or null when selection clears. */
export function resolveRemainingCargoRestockQuantity(
	target: CargoRestockTarget,
	creditedBase: number,
): number | null {
	const remainingBase = target.restockBaseQuantity - creditedBase;
	if (remainingBase <= 1e-6) return null;

	const remainingInCargoUnit = convertIngredientAmount(
		remainingBase,
		toSupportedUnit(target.restockBaseUnit),
		target.cargoDisplayUnit,
		target.cargoName,
	);
	if (remainingInCargoUnit === null || remainingInCargoUnit <= 1e-6) {
		return null;
	}

	const readable = chooseReadableUnit(remainingBase, target.restockBaseUnit);
	if (readable.unit === target.cargoDisplayUnit) {
		return readable.quantity;
	}

	return remainingInCargoUnit;
}

export function buildCargoRestockTarget(
	cargoId: string,
	cargoName: string,
	domain: string,
	cargoUnit: string,
	quantityOverride: number | null,
): CargoRestockTarget {
	const displayUnit = toSupportedUnit(cargoUnit);
	const restockQty = quantityOverride ?? 1;
	const base = computeBaseFields(restockQty, displayUnit, cargoName);
	return {
		cargoId,
		normalizedName: normalizeForCargoDedup(cargoName),
		domain: domain ?? "food",
		restockBaseQuantity: base.baseQuantity,
		restockBaseUnit: base.baseUnit,
		cargoDisplayUnit: displayUnit,
		cargoName,
	};
}

export function resolveRestockTargetForItem(
	item: DockedSupplyItemForReconcile,
	targetByCargoId: Map<string, CargoRestockTarget>,
	targetByKey: Map<string, CargoRestockTarget>,
): CargoRestockTarget | null {
	if (item.sourceCargoId) {
		return targetByCargoId.get(item.sourceCargoId) ?? null;
	}
	const key = `${normalizeForCargoDedup(item.name)}__${item.domain ?? "food"}`;
	return targetByKey.get(key) ?? null;
}
