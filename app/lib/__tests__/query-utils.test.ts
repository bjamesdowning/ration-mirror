import { describe, expect, it, vi } from "vitest";
import {
	chunkArray,
	chunkedInsert,
	chunkedQuery,
	D1_MAX_BOUND_PARAMS,
	D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
	D1_MAX_SUPPLY_ROWS_PER_STATEMENT,
	D1_MAX_TAG_INSERT_ROWS_PER_STATEMENT,
	D1_MAX_TAG_ROWS_PER_STATEMENT,
	D1_SAFE_BOUND_PARAMS,
	packByBindBudget,
	SUPPLY_ITEM_INSERT_COLUMNS,
} from "~/lib/query-utils.server";

describe("constants", () => {
	it("D1_MAX_BOUND_PARAMS is 100", () => {
		expect(D1_MAX_BOUND_PARAMS).toBe(100);
	});

	it("D1_SAFE_BOUND_PARAMS is 99", () => {
		expect(D1_SAFE_BOUND_PARAMS).toBe(99);
	});

	it("D1_MAX_INGREDIENT_ROWS_PER_STATEMENT is floor(100/10) = 10", () => {
		expect(D1_MAX_INGREDIENT_ROWS_PER_STATEMENT).toBe(10);
	});

	it("D1_MAX_TAG_ROWS_PER_STATEMENT is floor(100/2) = 50", () => {
		expect(D1_MAX_TAG_ROWS_PER_STATEMENT).toBe(50);
	});

	it("D1_MAX_TAG_INSERT_ROWS_PER_STATEMENT is floor(100/7) = 14", () => {
		expect(D1_MAX_TAG_INSERT_ROWS_PER_STATEMENT).toBe(14);
	});

	it("D1_MAX_SUPPLY_ROWS_PER_STATEMENT is floor(99/13) = 7", () => {
		expect(SUPPLY_ITEM_INSERT_COLUMNS).toBe(13);
		expect(D1_MAX_SUPPLY_ROWS_PER_STATEMENT).toBe(7);
	});
});

describe("packByBindBudget", () => {
	it("keeps statements that fit in one batch together", () => {
		const batches = packByBindBudget([
			{ bindCount: 3, value: "delete" },
			{ bindCount: 91, value: "insert-a" },
			{ bindCount: 2, value: "touch" },
		]);
		// 3+91=94, +2 = 96 → all fit
		expect(batches).toEqual([["delete", "insert-a", "touch"]]);
	});

	it("splits app-review-sized supply inserts across batches under 100 binds", () => {
		// 13 gap rows × 13 binds = 169 insert binds; plus 3 deletes + list touch
		const cols = SUPPLY_ITEM_INSERT_COLUMNS;
		const rowsPerInsert = D1_MAX_SUPPLY_ROWS_PER_STATEMENT;
		const insertRowCount = 13;
		const deleteIds = 3;
		const planned: Array<{ bindCount: number; value: string }> = [
			{ bindCount: deleteIds, value: "delete" },
		];
		for (let offset = 0; offset < insertRowCount; offset += rowsPerInsert) {
			const rows = Math.min(rowsPerInsert, insertRowCount - offset);
			planned.push({
				bindCount: rows * cols,
				value: `insert-${offset}`,
			});
		}
		planned.push({ bindCount: 2, value: "touch" });

		const batches = packByBindBudget(planned);
		for (const batch of batches) {
			const binds = batch.reduce((sum, label) => {
				const stmt = planned.find((p) => p.value === label);
				return sum + (stmt?.bindCount ?? 0);
			}, 0);
			expect(binds).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS);
		}
		expect(batches.length).toBeGreaterThan(1);
		expect(batches.flat()).toEqual(planned.map((p) => p.value));
	});

	it("returns empty array for empty input", () => {
		expect(packByBindBudget([])).toEqual([]);
	});

	it("throws when a single statement exceeds maxBinds", () => {
		expect(() =>
			packByBindBudget([{ bindCount: 101, value: "fat" }], 100),
		).toThrow(/exceeds maxBinds/);
	});

	it("throws when maxBinds is not positive", () => {
		expect(() => packByBindBudget([], 0)).toThrow(
			"maxBinds must be greater than 0",
		);
	});
});

describe("chunkArray", () => {
	it("splits array into chunks of the given size", () => {
		expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	it("returns single chunk when array is smaller than chunkSize", () => {
		expect(chunkArray([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
	});

	it("returns exact chunks when array divides evenly", () => {
		expect(chunkArray([1, 2, 3, 4], 2)).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("returns empty array for empty input", () => {
		expect(chunkArray([], 5)).toEqual([]);
	});

	it("throws when chunkSize is 0", () => {
		expect(() => chunkArray([1], 0)).toThrow(
			"chunkSize must be greater than 0",
		);
	});

	it("throws when chunkSize is negative", () => {
		expect(() => chunkArray([1], -1)).toThrow(
			"chunkSize must be greater than 0",
		);
	});

	it("handles chunkSize of 1 (each item is its own chunk)", () => {
		expect(chunkArray([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
	});
});

describe("chunkedInsert", () => {
	it("calls writeChunk once per chunk", async () => {
		const writeChunk = vi.fn().mockResolvedValue(undefined);
		await chunkedInsert([1, 2, 3, 4, 5], 2, writeChunk);
		expect(writeChunk).toHaveBeenCalledTimes(3);
		expect(writeChunk).toHaveBeenNthCalledWith(1, [1, 2]);
		expect(writeChunk).toHaveBeenNthCalledWith(2, [3, 4]);
		expect(writeChunk).toHaveBeenNthCalledWith(3, [5]);
	});

	it("does not call writeChunk for empty rows", async () => {
		const writeChunk = vi.fn().mockResolvedValue(undefined);
		await chunkedInsert([], 10, writeChunk);
		expect(writeChunk).not.toHaveBeenCalled();
	});

	it("throws when rowsPerStatement is 0", async () => {
		const writeChunk = vi.fn();
		await expect(chunkedInsert([1], 0, writeChunk)).rejects.toThrow(
			"rowsPerStatement must be greater than 0",
		);
	});

	it("awaits each chunk before proceeding to the next", async () => {
		const order: number[] = [];
		const writeChunk = vi.fn().mockImplementation(async (chunk: number[]) => {
			order.push(chunk[0]);
		});
		await chunkedInsert([10, 20, 30], 1, writeChunk);
		expect(order).toEqual([10, 20, 30]);
	});
});

describe("chunkedQuery", () => {
	it("passes through directly when ids fit in one chunk", async () => {
		const queryFn = vi.fn().mockResolvedValue(["a", "b"]);
		const result = await chunkedQuery(["id1", "id2"], queryFn, 100);
		expect(queryFn).toHaveBeenCalledOnce();
		expect(result).toEqual(["a", "b"]);
	});

	it("splits ids and combines results across multiple queries", async () => {
		const queryFn = vi
			.fn()
			.mockResolvedValueOnce(["r1", "r2"])
			.mockResolvedValueOnce(["r3"]);
		const ids = ["id1", "id2", "id3"];
		const result = await chunkedQuery(ids, queryFn, 2);
		expect(queryFn).toHaveBeenCalledTimes(2);
		expect(result).toEqual(["r1", "r2", "r3"]);
	});

	it("handles empty ids array", async () => {
		const queryFn = vi.fn().mockResolvedValue([]);
		const result = await chunkedQuery([], queryFn, 100);
		expect(queryFn).toHaveBeenCalledOnce();
		expect(result).toEqual([]);
	});

	it("uses default chunkSize of D1_SAFE_BOUND_PARAMS (99)", async () => {
		const ids = Array.from({ length: 50 }, (_, i) => `id${i}`);
		const queryFn = vi.fn().mockResolvedValue([]);
		await chunkedQuery(ids, queryFn);
		// 50 ids fit in default chunk of 99 — single call
		expect(queryFn).toHaveBeenCalledOnce();
	});

	it("chunks at 99 by default so org-scoped queries leave a bind slot", async () => {
		const ids = Array.from({ length: 100 }, (_, i) => `id${i}`);
		const queryFn = vi.fn().mockResolvedValue([]);
		await chunkedQuery(ids, queryFn);
		expect(queryFn).toHaveBeenCalledTimes(2);
		expect(queryFn.mock.calls[0][0]).toHaveLength(99);
		expect(queryFn.mock.calls[1][0]).toHaveLength(1);
	});
});

describe("supply_item Drizzle insert bind counts", () => {
	function sampleSupplyRows(count: number) {
		return Array.from({ length: count }, (_, i) => ({
			id: `id-${i}`,
			listId: "list-1",
			name: `Item ${i}`,
			quantity: 1,
			unit: "g",
			baseQuantity: 1,
			baseUnit: "g",
			domain: "food" as const,
			sourceMealId: null,
			sourceMealIds: ["m1"],
			sourceOrigins: ["manifest" as const],
			sourceCargoId: null,
		}));
	}

	it("8-row insert binds 104 params (exceeds D1 limit — why max is 7)", async () => {
		const { drizzle } = await import("drizzle-orm/d1");
		const { supplyItem } = await import("~/db/schema");
		const fakeDb = {
			prepare() {
				return { bind: () => ({}) };
			},
		};
		const d1 = drizzle(fakeDb as unknown as D1Database);
		const built = d1.insert(supplyItem).values(sampleSupplyRows(8)).toSQL();
		expect(built.params.length).toBe(104);
		expect(built.params.length).toBeGreaterThan(D1_MAX_BOUND_PARAMS);
	});

	it("7-row insert stays within safe D1 bind budget", async () => {
		const { drizzle } = await import("drizzle-orm/d1");
		const { supplyItem } = await import("~/db/schema");
		const fakeDb = {
			prepare() {
				return { bind: () => ({}) };
			},
		};
		const d1 = drizzle(fakeDb as unknown as D1Database);
		const built = d1
			.insert(supplyItem)
			.values(sampleSupplyRows(D1_MAX_SUPPLY_ROWS_PER_STATEMENT))
			.toSQL();
		expect(D1_MAX_SUPPLY_ROWS_PER_STATEMENT).toBe(7);
		expect(built.params.length).toBe(7 * SUPPLY_ITEM_INSERT_COLUMNS);
		expect(built.params.length).toBeLessThanOrEqual(D1_SAFE_BOUND_PARAMS);
	});
});
