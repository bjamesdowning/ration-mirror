import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { activeCargoSelection, cargo } from "../db/schema";
import {
	chunkArray,
	chunkedQuery,
	D1_MAX_BOUND_PARAMS,
} from "./query-utils.server";
import {
	buildCargoRestockTarget,
	computeCargoDockCreditBase,
	type DockedSupplyItemForReconcile,
	resolveRemainingCargoRestockQuantity,
	resolveRestockTargetForItem,
} from "./supply-dock-reconcile";

export async function getActiveCargoSelections(
	db: D1Database,
	organizationId: string,
) {
	const d1 = drizzle(db);
	return d1
		.select()
		.from(activeCargoSelection)
		.where(eq(activeCargoSelection.organizationId, organizationId));
}

export async function getActiveCargoIds(
	db: D1Database,
	organizationId: string,
): Promise<string[]> {
	const rows = await getActiveCargoSelections(db, organizationId);
	return rows.map((r) => r.cargoId);
}

export async function toggleCargoSelection(
	db: D1Database,
	organizationId: string,
	cargoId: string,
	quantityOverride?: number,
) {
	const d1 = drizzle(db);

	const [cargoRow] = await d1
		.select({ id: cargo.id })
		.from(cargo)
		.where(
			and(eq(cargo.id, cargoId), eq(cargo.organizationId, organizationId)),
		);

	if (!cargoRow) {
		throw new Error("Cargo item not found or unauthorized");
	}

	const [existing] = await d1
		.select()
		.from(activeCargoSelection)
		.where(
			and(
				eq(activeCargoSelection.organizationId, organizationId),
				eq(activeCargoSelection.cargoId, cargoId),
			),
		);

	if (existing) {
		await d1
			.delete(activeCargoSelection)
			.where(eq(activeCargoSelection.id, existing.id));
		return { isActive: false };
	}

	await d1.insert(activeCargoSelection).values({
		organizationId,
		cargoId,
		quantityOverride: quantityOverride ?? null,
	});

	return { isActive: true, quantityOverride: quantityOverride ?? null };
}

export async function clearCargoSelections(
	db: D1Database,
	organizationId: string,
) {
	const d1 = drizzle(db);
	const selections = await d1
		.select({ id: activeCargoSelection.id })
		.from(activeCargoSelection)
		.where(eq(activeCargoSelection.organizationId, organizationId));

	if (selections.length === 0) {
		return { cleared: 0 };
	}

	await d1
		.delete(activeCargoSelection)
		.where(eq(activeCargoSelection.organizationId, organizationId));

	return { cleared: selections.length };
}

export async function validateCargoOwnership(
	db: D1Database,
	organizationId: string,
	cargoId: string,
) {
	const d1 = drizzle(db);
	const [record] = await d1
		.select({ id: cargo.id })
		.from(cargo)
		.where(
			and(eq(cargo.id, cargoId), eq(cargo.organizationId, organizationId)),
		);

	if (!record) {
		throw new Error("Cargo item not found or unauthorized");
	}
}

/**
 * After docking purchased supply rows, reduce or clear cargo restock selections
 * when docked quantity fulfills the explicit cargo restock intent.
 * Meal/manifest/galley gaps are handled separately via supply resync.
 */
export async function fulfillCargoSelectionsFromDockedSupplyItems(
	db: D1Database,
	organizationId: string,
	dockedItems: DockedSupplyItemForReconcile[],
): Promise<{ cleared: number; reduced: number }> {
	if (dockedItems.length === 0) return { cleared: 0, reduced: 0 };

	const d1 = drizzle(db);
	const selections = await getActiveCargoSelections(db, organizationId);
	if (selections.length === 0) return { cleared: 0, reduced: 0 };

	const cargoIds = selections.map((s) => s.cargoId);
	const cargoRows = await chunkedQuery(
		cargoIds,
		(chunk) =>
			d1
				.select({
					id: cargo.id,
					name: cargo.name,
					unit: cargo.unit,
					domain: cargo.domain,
				})
				.from(cargo)
				.where(
					and(
						eq(cargo.organizationId, organizationId),
						inArray(cargo.id, chunk),
					),
				),
		99,
	);

	const targetByCargoId = new Map<
		string,
		ReturnType<typeof buildCargoRestockTarget>
	>();
	const targetByKey = new Map<
		string,
		ReturnType<typeof buildCargoRestockTarget>
	>();
	const selectionByCargoId = new Map(selections.map((s) => [s.cargoId, s]));

	for (const row of cargoRows) {
		const selection = selectionByCargoId.get(row.id);
		if (!selection) continue;
		const target = buildCargoRestockTarget(
			row.id,
			row.name,
			row.domain ?? "food",
			row.unit ?? "unit",
			selection.quantityOverride,
		);
		targetByCargoId.set(row.id, target);
		targetByKey.set(`${target.normalizedName}__${target.domain}`, target);
	}

	const creditBaseByCargoId = new Map<string, number>();

	for (const item of dockedItems) {
		const target = resolveRestockTargetForItem(
			item,
			targetByCargoId,
			targetByKey,
		);
		const credit = computeCargoDockCreditBase(item, target);
		if (credit <= 0 || !target) continue;

		const existing = creditBaseByCargoId.get(target.cargoId) ?? 0;
		creditBaseByCargoId.set(target.cargoId, existing + credit);
	}

	let cleared = 0;
	let reduced = 0;

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const batchOps: any[] = [];

	for (const [cargoId, creditedBase] of creditBaseByCargoId) {
		const target = targetByCargoId.get(cargoId);
		const selection = selectionByCargoId.get(cargoId);
		if (!target || !selection) continue;

		const remainingQty = resolveRemainingCargoRestockQuantity(
			target,
			creditedBase,
		);

		if (remainingQty === null) {
			batchOps.push(
				d1
					.delete(activeCargoSelection)
					.where(eq(activeCargoSelection.id, selection.id)),
			);
			cleared += 1;
			continue;
		}

		batchOps.push(
			d1
				.update(activeCargoSelection)
				.set({ quantityOverride: remainingQty })
				.where(eq(activeCargoSelection.id, selection.id)),
		);
		reduced += 1;
	}

	for (const opChunk of chunkArray(batchOps, D1_MAX_BOUND_PARAMS)) {
		const [firstOp, ...remainingOps] = opChunk;
		if (!firstOp) continue;
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch([firstOp, ...remainingOps] as [any, ...any[]]);
	}

	return { cleared, reduced };
}
