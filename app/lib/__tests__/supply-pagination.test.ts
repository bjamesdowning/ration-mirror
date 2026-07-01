import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behaviorally-accurate mock for `drizzle-orm/d1`: `.limit()`/`.offset()`
 * actually slice the in-memory row set (mirroring SQL LIMIT/OFFSET
 * semantics — offset applied before limit), rather than the usual
 * `mockReturnThis()` no-op chain. This lets these tests exercise the real
 * pagination math threaded through `getSupplyListById`/`getSupplyList`,
 * not just verify that `.limit()` was called.
 */
let listsData: { id: string; organizationId: string }[] = [];
let itemsData: Array<{
	id: string;
	listId: string;
	name: string;
	quantity: number;
	unit: string;
	domain: string;
	isPurchased: boolean;
	sourceMealId: string | null;
	sourceMealIds: string[];
	createdAt: Date;
}> = [];

vi.mock("drizzle-orm/d1", () => {
	function createChain() {
		let limitVal: number | undefined;
		let offsetVal: number | undefined;
		// Table is only known once `.from(table)` is called; detected by
		// column signature (`isPurchased` only exists on supplyItem) rather
		// than call order, since call order is an implementation detail.
		let getRows = (): unknown[] => listsData;
		// biome-ignore lint/suspicious/noExplicitAny: minimal test-only query-builder stub
		const chain: any = {};
		chain.from = vi.fn((table: unknown) => {
			const isItemsTable =
				!!table && typeof table === "object" && "isPurchased" in table;
			getRows = () => (isItemsTable ? itemsData : listsData);
			return chain;
		});
		chain.where = vi.fn(() => chain);
		chain.orderBy = vi.fn(() => chain);
		chain.$dynamic = vi.fn(() => chain);
		chain.limit = vi.fn((n: number) => {
			limitVal = n;
			return chain;
		});
		chain.offset = vi.fn((n: number) => {
			offsetVal = n;
			return chain;
		});
		// biome-ignore lint/suspicious/noThenProperty: intentional thenable test stub standing in for a D1 prepared-statement query
		chain.then = (resolve: (v: unknown) => unknown, reject?: unknown) => {
			let rows = getRows();
			if (offsetVal !== undefined) rows = rows.slice(offsetVal);
			if (limitVal !== undefined) rows = rows.slice(0, limitVal);
			// biome-ignore lint/suspicious/noExplicitAny: test stub, reject is a standard Promise callback
			return Promise.resolve(rows).then(resolve, reject as any);
		};
		return chain;
	}

	return {
		drizzle: vi.fn(() => ({
			select: vi.fn(() => createChain()),
			batch: vi.fn(async (queries: unknown[]) =>
				Promise.all(queries.map((q) => Promise.resolve(q))),
			),
		})),
	};
});

function makeItem(index: number) {
	return {
		id: `item_${index}`,
		listId: "list_1",
		name: `item ${index}`,
		quantity: 1,
		unit: "ea",
		domain: "food",
		isPurchased: false,
		sourceMealId: null,
		sourceMealIds: [],
		createdAt: new Date(2026, 0, 1 + index),
	};
}

describe("supply item pagination (getSupplyListById options)", () => {
	beforeEach(() => {
		listsData = [{ id: "list_1", organizationId: "org_1" }];
		itemsData = Array.from({ length: 30 }, (_, i) => makeItem(i));
	});

	it("returns all items unchanged when no options are passed", async () => {
		const { getSupplyListById } = await import("~/lib/supply.server");
		const result = await getSupplyListById({} as D1Database, "org_1", "list_1");

		expect(result?.items).toHaveLength(30);
		expect(result?.items[0].id).toBe("item_0");
	});

	it("caps the returned count when limit is passed", async () => {
		const { getSupplyListById } = await import("~/lib/supply.server");
		const result = await getSupplyListById(
			{} as D1Database,
			"org_1",
			"list_1",
			{ limit: 10 },
		);

		expect(result?.items).toHaveLength(10);
		expect(result?.items.map((i) => i.id)).toEqual(
			Array.from({ length: 10 }, (_, i) => `item_${i}`),
		);
	});

	it("skips correctly when offset is passed", async () => {
		const { getSupplyListById } = await import("~/lib/supply.server");
		const result = await getSupplyListById(
			{} as D1Database,
			"org_1",
			"list_1",
			{ offset: 25 },
		);

		expect(result?.items).toHaveLength(5);
		expect(result?.items[0].id).toBe("item_25");
	});

	it("combines limit and offset correctly for a middle page, with no gaps/overlaps across pages", async () => {
		const { getSupplyListById } = await import("~/lib/supply.server");

		const page1 = await getSupplyListById({} as D1Database, "org_1", "list_1", {
			limit: 12,
			offset: 0,
		});
		const page2 = await getSupplyListById({} as D1Database, "org_1", "list_1", {
			limit: 12,
			offset: 12,
		});
		const page3 = await getSupplyListById({} as D1Database, "org_1", "list_1", {
			limit: 12,
			offset: 24,
		});

		expect(page1?.items).toHaveLength(12);
		expect(page2?.items).toHaveLength(12);
		expect(page3?.items).toHaveLength(6);

		const concatenatedIds = [
			...(page1?.items ?? []),
			...(page2?.items ?? []),
			...(page3?.items ?? []),
		].map((i) => i.id);
		const expectedIds = Array.from({ length: 30 }, (_, i) => `item_${i}`);
		expect(concatenatedIds).toEqual(expectedIds);
	});
});
