/**
 * Cloudflare D1 limit: max bound parameters per query (each ? counts).
 * Standard SQLite allows 999; D1 enforces 100. Use this for D1-backed code.
 * @see https://developers.cloudflare.com/d1/platform/limits/
 */
export const D1_MAX_BOUND_PARAMS = 100;

const SQLITE_SAFE_VARIABLE_LIMIT = D1_MAX_BOUND_PARAMS;

/**
 * Max meal_ingredient rows per INSERT.
 * Includes generated id from $defaultFn, so each row binds 8 params.
 */
export const D1_MAX_INGREDIENT_ROWS_PER_STATEMENT = Math.floor(
	D1_MAX_BOUND_PARAMS / 8,
);

/**
 * Max meal_tag rows per INSERT.
 * Includes generated id from $defaultFn, so each row binds 3 params.
 */
export const D1_MAX_TAG_ROWS_PER_STATEMENT = Math.floor(
	D1_MAX_BOUND_PARAMS / 3,
);

/**
 * Max meal_plan_entry rows per INSERT.
 * Columns bound: id, planId, mealId, date, slotType, orderIndex,
 * servingsOverride, notes = 8 params per row.
 */
export const D1_MAX_PLAN_ENTRY_ROWS_PER_STATEMENT = Math.floor(
	D1_MAX_BOUND_PARAMS / 8,
);

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
	if (chunkSize <= 0) {
		throw new Error("chunkSize must be greater than 0");
	}

	if (items.length === 0) return [];

	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize));
	}

	return chunks;
}

export async function chunkedInsert<T>(
	rows: T[],
	rowsPerStatement: number,
	writeChunk: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
	if (rowsPerStatement <= 0) {
		throw new Error("rowsPerStatement must be greater than 0");
	}

	for (const rowChunk of chunkArray(rows, rowsPerStatement)) {
		await writeChunk(rowChunk);
	}
}

export async function chunkedQuery<T, TId extends string = string>(
	ids: TId[],
	queryFn: (chunk: TId[]) => Promise<T[]>,
	chunkSize = SQLITE_SAFE_VARIABLE_LIMIT,
): Promise<T[]> {
	if (ids.length <= chunkSize) {
		return queryFn(ids);
	}

	const results: T[] = [];
	for (let i = 0; i < ids.length; i += chunkSize) {
		const chunk = ids.slice(i, i + chunkSize);
		results.push(...(await queryFn(chunk)));
	}

	return results;
}
