import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cargo } from "../db/schema";

/**
 * Lightweight projection of a cargo row — only the fields needed for
 * dedup / matching / deduction lookups.  Every function that used to
 * `SELECT * FROM cargo WHERE organization_id = ?` should use this
 * type and the {@link fetchOrgCargoIndex} helper instead.
 */
export interface CargoIndexRow {
	id: string;
	name: string;
	domain: string;
	quantity: number;
	unit: string;
}

/**
 * Fetches only the columns required for inventory matching and deduction.
 * Avoids transferring tags, status, timestamps, etc. which can double
 * serialisation cost for organisations with 1 000+ items.
 */
export async function fetchOrgCargoIndex(
	db: D1Database,
	organizationId: string,
): Promise<CargoIndexRow[]> {
	const d1 = drizzle(db);
	return d1
		.select({
			id: cargo.id,
			name: cargo.name,
			domain: cargo.domain,
			quantity: cargo.quantity,
			unit: cargo.unit,
		})
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));
}
