import { and, eq, sql } from "drizzle-orm";
import { cargo } from "../db/schema";
import { computeBaseFields, effectiveBaseFields } from "./base-quantity";
import { convertIngredientAmount, toSupportedUnit } from "./units";

export type CargoDeductionSnapshot = {
	quantity: number;
	unit: string;
	baseQuantity: number;
	baseUnit: string;
	name: string;
};

/**
 * Converts a signed delta in cargo's authored unit into a signed delta for
 * `base_quantity`, keeping denormalized columns consistent with cook/undo writes.
 */
export function resolveBaseQuantityDelta(
	snapshot: CargoDeductionSnapshot,
	signedDeltaInCargoUnit: number,
): { signedBaseDelta: number; useAbsoluteBase?: number } {
	if (signedDeltaInCargoUnit === 0) {
		return { signedBaseDelta: 0 };
	}

	const base = effectiveBaseFields(
		snapshot.quantity,
		snapshot.unit,
		snapshot.baseQuantity,
		snapshot.baseUnit,
		snapshot.name,
	);
	const cargoUnit = toSupportedUnit(snapshot.unit);
	const magnitude = Math.abs(signedDeltaInCargoUnit);
	const converted = convertIngredientAmount(
		magnitude,
		cargoUnit,
		base.baseUnit,
		snapshot.name,
	);

	if (converted !== null) {
		const signedBaseDelta = signedDeltaInCargoUnit < 0 ? -converted : converted;
		return { signedBaseDelta };
	}

	const nextQuantity = snapshot.quantity + signedDeltaInCargoUnit;
	const nextBase = computeBaseFields(
		nextQuantity,
		snapshot.unit,
		snapshot.name,
	);
	return {
		signedBaseDelta: nextBase.baseQuantity - base.baseQuantity,
		useAbsoluteBase: nextBase.baseQuantity,
	};
}

/**
 * Builds an atomic quantity + baseQuantity relative UPDATE for cook/consume/undo.
 * When deducting (negative delta), requires sufficient authored quantity.
 */
export function buildCargoQuantityDeltaUpdate(
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle D1 db typing is complex across call sites
	d1: any,
	organizationId: string,
	cargoId: string,
	signedDeltaInCargoUnit: number,
	signedBaseDelta: number,
	options?: {
		requireSufficient?: boolean;
		absoluteBaseQuantity?: number;
	},
) {
	const requireSufficient =
		options?.requireSufficient ?? signedDeltaInCargoUnit < 0;
	const setFields: {
		quantity: ReturnType<typeof sql>;
		baseQuantity: ReturnType<typeof sql> | number;
		updatedAt: Date;
	} = {
		quantity: sql`${cargo.quantity} + ${signedDeltaInCargoUnit}`,
		baseQuantity:
			options?.absoluteBaseQuantity != null
				? options.absoluteBaseQuantity
				: sql`${cargo.baseQuantity} + ${signedBaseDelta}`,
		updatedAt: new Date(),
	};

	const conditions = [
		eq(cargo.id, cargoId),
		eq(cargo.organizationId, organizationId),
	];
	if (requireSufficient) {
		conditions.push(
			sql`${cargo.quantity} >= ${Math.abs(signedDeltaInCargoUnit)}`,
		);
	}

	return d1
		.update(cargo)
		.set(setFields)
		.where(and(...conditions));
}

/** Stable sort for multi-row cargo updates (deadlock hygiene). */
export function sortCargoIdsForUpdate(ids: string[]): string[] {
	return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
