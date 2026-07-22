import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cargo } from "../db/schema";
import {
	buildCargoQuantityDeltaUpdate,
	type CargoDeductionSnapshot,
	resolveBaseQuantityDelta,
	sortCargoIdsForUpdate,
} from "./cargo-deduction";
import { chunkedQuery, D1_MAX_BOUND_PARAMS } from "./query-utils.server";

export type CargoQuantityDeduction = { cargoId: string; quantity: number };

/**
 * Loads cargo snapshots and builds atomic quantity + baseQuantity delta updates.
 * Deduction quantity is always positive (amount to remove); pass `sign: 1` to restore.
 */
export async function buildCargoDeductionStatements(
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle D1 db typing is complex across call sites
	d1: any,
	organizationId: string,
	deductions: CargoQuantityDeduction[],
	options?: { sign?: -1 | 1 },
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement union
): Promise<any[]> {
	const sign = options?.sign ?? -1;
	if (deductions.length === 0) return [];

	const byId = new Map<string, number>();
	for (const d of deductions) {
		if (d.quantity <= 0) continue;
		byId.set(d.cargoId, (byId.get(d.cargoId) ?? 0) + d.quantity);
	}
	const cargoIds = sortCargoIdsForUpdate([...byId.keys()]);
	if (cargoIds.length === 0) return [];

	const rows = (await chunkedQuery(
		cargoIds,
		(chunk) =>
			d1
				.select({
					id: cargo.id,
					name: cargo.name,
					quantity: cargo.quantity,
					unit: cargo.unit,
					baseQuantity: cargo.baseQuantity,
					baseUnit: cargo.baseUnit,
				})
				.from(cargo)
				.where(
					and(
						eq(cargo.organizationId, organizationId),
						inArray(cargo.id, chunk),
					),
				),
		D1_MAX_BOUND_PARAMS - 1,
	)) as Array<{ id: string } & CargoDeductionSnapshot>;

	const snapshotById = new Map(rows.map((r) => [r.id, r]));

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement union
	const stmts: any[] = [];
	for (const cargoId of cargoIds) {
		const amount = byId.get(cargoId) ?? 0;
		const snapshot = snapshotById.get(cargoId);
		if (!snapshot || amount <= 0) continue;

		const signedDelta = sign * amount;
		const { signedBaseDelta, useAbsoluteBase } = resolveBaseQuantityDelta(
			snapshot,
			signedDelta,
		);
		stmts.push(
			buildCargoQuantityDeltaUpdate(
				d1,
				organizationId,
				cargoId,
				signedDelta,
				signedBaseDelta,
				{
					requireSufficient: sign < 0,
					absoluteBaseQuantity: useAbsoluteBase,
				},
			),
		);
	}
	return stmts;
}

/** Convenience: apply deductions immediately (cook path). */
export async function applyCargoDeductions(
	db: D1Database,
	organizationId: string,
	deductions: CargoQuantityDeduction[],
	options?: { sign?: -1 | 1 },
): Promise<void> {
	const d1 = drizzle(db);
	const stmts = await buildCargoDeductionStatements(
		d1,
		organizationId,
		deductions,
		options,
	);
	if (stmts.length === 0) return;
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(stmts as [any, ...any[]]);
}
