import type { IntakeLoggedUnit } from "./intake-amount";

export type SavedFoodNumbers = {
	id: string;
	userId: string;
	name: string;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
	defaultAmount: number | null;
	defaultUnit: string | null;
	barcode: string | null;
	fdcId: string | null;
};

const LOGGED_UNITS = new Set<IntakeLoggedUnit>(["serving", "g", "oz"]);

function loggedUnit(unit: string | null): IntakeLoggedUnit | undefined {
	if (unit && LOGGED_UNITS.has(unit as IntakeLoggedUnit)) {
		return unit as IntakeLoggedUnit;
	}
	return undefined;
}

/**
 * Logging a saved food copies its stored name and nutrients.
 * Caller-supplied macros are not used.
 */
export function copySavedFoodOntoWrite(saved: SavedFoodNumbers): {
	savedFoodId: string;
	name: string;
	amount?: number;
	unit?: IntakeLoggedUnit;
	macros: {
		energyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		fiberG: number | null;
	};
	barcode: string | null;
	fdcId: string | null;
} {
	const unit = loggedUnit(saved.defaultUnit);
	return {
		savedFoodId: saved.id,
		name: saved.name,
		...(saved.defaultAmount != null && unit
			? { amount: saved.defaultAmount, unit }
			: {}),
		macros: {
			energyKcal: saved.energyKcal,
			proteinG: saved.proteinG,
			carbsG: saved.carbsG,
			fatG: saved.fatG,
			fiberG: saved.fiberG,
		},
		barcode: saved.barcode,
		fdcId: saved.fdcId,
	};
}

/** A read is empty unless the row belongs to the reader. */
export function savedFoodsVisibleTo<T extends { userId: string }>(
	rows: readonly T[],
	readerId: string,
): T[] {
	return rows.filter((row) => row.userId === readerId);
}
