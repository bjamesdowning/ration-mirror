import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	insertManifestBulkEntries,
	type ManifestBulkSubmissionError,
} from "../manifest-bulk-submit.server";

const mocks = vi.hoisted(() => ({
	queryResults: [] as Array<Array<{ id: string }>>,
	batch: vi.fn(),
	values: vi.fn((rows: unknown[]) => ({ rows })),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => mocks.queryResults.shift() ?? [],
				}),
			}),
		}),
		insert: () => ({ values: mocks.values }),
		batch: mocks.batch,
	}),
}));

describe("insertManifestBulkEntries", () => {
	beforeEach(() => {
		mocks.queryResults.length = 0;
		mocks.batch.mockReset().mockResolvedValue([]);
		mocks.values.mockClear();
	});

	it("validates first and inserts all rows in one atomic batch", async () => {
		const mealId = "11111111-1111-4111-8111-111111111111";
		mocks.queryResults.push([{ id: "plan-1" }], [{ id: mealId }]);
		const entries = Array.from({ length: 13 }, (_, index) => ({
			mealId,
			date: `2026-07-${String(index + 1).padStart(2, "0")}`,
			slotType: "dinner" as const,
			orderIndex: 0,
		}));

		const result = await insertManifestBulkEntries(
			{} as D1Database,
			"org-1",
			"plan-1",
			{ entries },
		);

		expect(result.inserted).toBe(13);
		expect(new Set(result.entries.map((entry) => entry.entryId)).size).toBe(13);
		expect(mocks.values).toHaveBeenCalledTimes(2);
		expect(mocks.batch).toHaveBeenCalledTimes(1);
		expect(mocks.batch.mock.calls[0]?.[0]).toHaveLength(2);
	});

	it("does not write when any meal is unauthorized", async () => {
		mocks.queryResults.push([{ id: "plan-1" }], []);

		const promise = insertManifestBulkEntries(
			{} as D1Database,
			"org-1",
			"plan-1",
			{
				entries: [
					{
						mealId: "11111111-1111-4111-8111-111111111111",
						date: "2026-07-11",
						slotType: "dinner",
						orderIndex: 0,
					},
				],
			},
		);

		await expect(promise).rejects.toEqual(
			expect.objectContaining<Partial<ManifestBulkSubmissionError>>({
				status: 403,
			}),
		);
		expect(mocks.batch).not.toHaveBeenCalled();
	});
});
