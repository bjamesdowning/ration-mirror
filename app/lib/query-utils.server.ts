/**
 * Cloudflare D1 limit: max bound parameters per query (each ? counts).
 * Standard SQLite allows 999; D1 enforces 100. Use this for D1-backed code.
 * @see https://developers.cloudflare.com/d1/platform/limits/
 */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Prefer 99 over 100 for `IN (...)` / multi-row inserts so we stay under D1's
 * hard ceiling even when an extra bind appears (org id, update WHERE, etc.).
 */
export const D1_SAFE_BOUND_PARAMS = D1_MAX_BOUND_PARAMS - 1;

/**
 * Default `IN (...)` chunk size. Use 99 (not 100) so org-scoped queries that
 * also bind `organization_id` stay within D1's hard ceiling of 100.
 */
const SQLITE_SAFE_VARIABLE_LIMIT = D1_SAFE_BOUND_PARAMS;

/**
 * Max meal_ingredient rows per INSERT.
 * Includes generated id from $defaultFn plus base_quantity/base_unit,
 * so each row binds 10 params.
 */
export const D1_MAX_INGREDIENT_ROWS_PER_STATEMENT = Math.floor(
	D1_MAX_BOUND_PARAMS / 10,
);

/**
 * Max cargo_tag / meal_tag rows per INSERT (composite PK: 2 columns per row).
 */
export const D1_MAX_TAG_ROWS_PER_STATEMENT = Math.floor(
	D1_MAX_BOUND_PARAMS / 2,
);

/**
 * Max tag registry rows per INSERT.
 * Columns bound: id, organizationId, slug, name, color, category, createdBy = 7.
 */
export const D1_MAX_TAG_INSERT_ROWS_PER_STATEMENT = Math.floor(
	D1_MAX_BOUND_PARAMS / 7,
);

/**
 * Columns bound: id, planId, mealId, date, slotType, orderIndex,
 * servingsOverride, notes = 8 params per row.
 */
export const D1_MAX_PLAN_ENTRY_ROWS_PER_STATEMENT = Math.floor(
	D1_MAX_BOUND_PARAMS / 8,
);

/**
 * Bound params per supply_item row in Drizzle multi-row INSERTs.
 * Row objects from `contributionsToSupplyRows` expose 12 keys, but Drizzle
 * also binds the `is_purchased` default (`?`). `created_at` uses
 * `(unixepoch())` with no bind. Confirmed via `insert().values(...).toSQL()`.
 * Do NOT use `Object.keys(row).length` — that undercounts and yields 8×13=104.
 */
export const SUPPLY_ITEM_INSERT_COLUMNS = 13;

/**
 * Max supply_item rows per INSERT (uses safe 99 ceiling).
 * 7 × 13 = 91 ≤ 99; 8 × 13 = 104 exceeds D1's 100-param limit.
 */
export const D1_MAX_SUPPLY_ROWS_PER_STATEMENT = Math.floor(
	D1_SAFE_BOUND_PARAMS / SUPPLY_ITEM_INSERT_COLUMNS,
);

export type BindBudgetStatement<T> = {
	/** Approximate number of `?` placeholders this statement binds. */
	bindCount: number;
	value: T;
};

/**
 * Packs statements into batches where the sum of `bindCount` per batch never
 * exceeds `maxBinds`. D1 rejects with "too many SQL variables" when a batch
 * script exceeds the 100-parameter ceiling — multi-row inserts are dense, so
 * callers must budget binds (not just statement count).
 */
export function packByBindBudget<T>(
	statements: Array<BindBudgetStatement<T>>,
	maxBinds: number = D1_MAX_BOUND_PARAMS,
): T[][] {
	if (maxBinds <= 0) {
		throw new Error("maxBinds must be greater than 0");
	}

	const batches: T[][] = [];
	let current: T[] = [];
	let used = 0;

	for (const stmt of statements) {
		if (stmt.bindCount < 0) {
			throw new Error("bindCount must be >= 0");
		}
		if (stmt.bindCount > maxBinds) {
			throw new Error(
				`Statement bindCount ${stmt.bindCount} exceeds maxBinds ${maxBinds}`,
			);
		}
		if (current.length > 0 && used + stmt.bindCount > maxBinds) {
			batches.push(current);
			current = [];
			used = 0;
		}
		current.push(stmt.value);
		used += stmt.bindCount;
	}

	if (current.length > 0) {
		batches.push(current);
	}

	return batches;
}

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
