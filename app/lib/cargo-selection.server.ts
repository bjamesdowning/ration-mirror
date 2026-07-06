import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { activeCargoSelection, cargo } from "../db/schema";

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
	});

	return { isActive: true };
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
