/**
 * Bounded, idempotent copy of manifest_date into null fuel_date.
 * Request paths must not call this. The daily hygiene cron drains it.
 */
import { and, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { D1_MAX_FUEL_DATE_BACKFILL_ROWS } from "~/lib/query-utils.server";

export { D1_MAX_FUEL_DATE_BACKFILL_ROWS };

function cappedBatchSize(limit: number): number {
	if (!Number.isFinite(limit) || limit < 1) return 1;
	return Math.min(Math.floor(limit), D1_MAX_FUEL_DATE_BACKFILL_ROWS);
}

/** Update at most one bounded batch. A second call skips rows already filled. */
export async function backfillFuelDateBatch(
	db: D1Database,
	limit = D1_MAX_FUEL_DATE_BACKFILL_ROWS,
): Promise<number> {
	const batchSize = cappedBatchSize(limit);
	const d1 = drizzle(db, { schema });
	const rows = await d1
		.select({ id: schema.nutritionIntake.id })
		.from(schema.nutritionIntake)
		.where(
			and(
				isNull(schema.nutritionIntake.fuelDate),
				isNotNull(schema.nutritionIntake.manifestDate),
			),
		)
		.limit(batchSize);
	if (rows.length === 0) return 0;
	await d1
		.update(schema.nutritionIntake)
		.set({
			fuelDate: sql`${schema.nutritionIntake.manifestDate}`,
		})
		.where(
			and(
				inArray(
					schema.nutritionIntake.id,
					rows.map((row) => row.id),
				),
				isNull(schema.nutritionIntake.fuelDate),
			),
		);
	return rows.length;
}

/** Drain null fuel dates across rounds. Each statement stays within the bind cap. */
export async function backfillFuelDatesBounded(
	db: D1Database,
	options?: { maxRounds?: number; batchSize?: number },
): Promise<number> {
	const batchSize = cappedBatchSize(
		options?.batchSize ?? D1_MAX_FUEL_DATE_BACKFILL_ROWS,
	);
	const maxRounds = Math.max(1, options?.maxRounds ?? 40);
	let total = 0;
	for (let round = 0; round < maxRounds; round++) {
		const updated = await backfillFuelDateBatch(db, batchSize);
		total += updated;
		if (updated < batchSize) break;
	}
	return total;
}
