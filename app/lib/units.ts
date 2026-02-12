const UNIT_FACTORS_TO_BASE = {
	kg: { family: "weight_metric", baseUnit: "g", factor: 1000 },
	g: { family: "weight_metric", baseUnit: "g", factor: 1 },
	lb: { family: "weight_imperial", baseUnit: "oz", factor: 16 },
	oz: { family: "weight_imperial", baseUnit: "oz", factor: 1 },
	l: { family: "volume_metric", baseUnit: "ml", factor: 1000 },
	ml: { family: "volume_metric", baseUnit: "ml", factor: 1 },
	unit: { family: "count_unit", baseUnit: "unit", factor: 1 },
	can: { family: "count_can", baseUnit: "can", factor: 1 },
	pack: { family: "count_pack", baseUnit: "pack", factor: 1 },
} as const;

export type SupportedUnit = keyof typeof UNIT_FACTORS_TO_BASE;
export type UnitFamily = (typeof UNIT_FACTORS_TO_BASE)[SupportedUnit]["family"];
export type BaseUnit = (typeof UNIT_FACTORS_TO_BASE)[SupportedUnit]["baseUnit"];

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

	if (baseUnit === "ml") {
		if (baseQuantity >= 1000) {
			return { quantity: baseQuantity / 1000, unit: "l" };
		}
		return { quantity: baseQuantity, unit: "ml" };
	}

	if (baseUnit === "oz") {
		if (baseQuantity >= 16) {
			return { quantity: baseQuantity / 16, unit: "lb" };
		}
		return { quantity: baseQuantity, unit: "oz" };
	}

	return { quantity: baseQuantity, unit: baseUnit };
}
