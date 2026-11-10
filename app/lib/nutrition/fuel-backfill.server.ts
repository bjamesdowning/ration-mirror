/**
 * Copy manifest_date into fuel_date once. No time-zone math.
 * Idempotent: rows that already have fuel_date are left alone.
 */
export async function backfillFuelDates(db: D1Database): Promise<number> {
	const result = await db
		.prepare(
			`UPDATE nutrition_intake
			 SET fuel_date = manifest_date
			 WHERE fuel_date IS NULL AND manifest_date IS NOT NULL`,
		)
		.run();
	return result.meta.changes ?? 0;
}
