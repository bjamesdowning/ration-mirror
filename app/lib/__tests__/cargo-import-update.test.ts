import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockBatch,
	mockSelectWhere,
	mockUpdateSet,
	mockUpdateWhere,
	mockDeleteWhere,
	mockInsertValues,
	resolveTagIds,
	getTagsForCargoIds,
	upsertCargoVectors,
	findSimilarCargoBatch,
	checkCapacity,
} = vi.hoisted(() => ({
	mockBatch: vi.fn(),
	mockSelectWhere: vi.fn(),
	mockUpdateSet: vi.fn(),
	mockUpdateWhere: vi.fn(),
	mockDeleteWhere: vi.fn(),
	mockInsertValues: vi.fn(),
	resolveTagIds: vi.fn(),
	getTagsForCargoIds: vi.fn(),
	upsertCargoVectors: vi.fn(),
	findSimilarCargoBatch: vi.fn(),
	checkCapacity: vi.fn(),
}));

vi.mock("../tags.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../tags.server")>();
	return {
		...actual,
		resolveTagIds,
		getTagsForCargoIds,
	};
});

vi.mock("../capacity.server", () => ({
	checkCapacity,
	CapacityExceededError: class CapacityExceededError extends Error {
		override name = "CapacityExceededError" as const;
	},
}));

vi.mock("../vector.server", () => ({
	deleteCargoVectors: vi.fn(),
	findSimilarCargoBatch,
	SIMILARITY_THRESHOLDS: { CARGO_MERGE: 0.92 },
	upsertCargoVector: vi.fn(),
	upsertCargoVectors,
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: mockSelectWhere,
			})),
		})),
		update: vi.fn(() => ({
			set: mockUpdateSet.mockReturnValue({
				where: mockUpdateWhere,
			}),
		})),
		delete: vi.fn(() => ({
			where: mockDeleteWhere.mockResolvedValue(undefined),
		})),
		insert: vi.fn(() => ({
			values: mockInsertValues.mockResolvedValue(undefined),
		})),
		batch: mockBatch,
	})),
}));

import { applyCargoImport } from "../cargo.server";

describe("applyCargoImport updates", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBatch.mockResolvedValue([]);
		resolveTagIds.mockResolvedValue(["tag-1"]);
		getTagsForCargoIds.mockResolvedValue(new Map());
		upsertCargoVectors.mockResolvedValue(undefined);
		checkCapacity.mockResolvedValue({ allowed: true });
		findSimilarCargoBatch.mockResolvedValue(new Map());
	});

	it("batch updates existing rows with a single d1.batch call", async () => {
		mockSelectWhere
			.mockResolvedValueOnce([{ id: "cargo-1" }, { id: "cargo-2" }])
			.mockResolvedValueOnce([
				{
					id: "cargo-1",
					name: "milk",
					quantity: 1,
					unit: "gal",
					domain: "food",
					expiresAt: null,
					baseQuantity: 1,
					baseUnit: "gal",
					status: "stable",
				},
				{
					id: "cargo-2",
					name: "eggs",
					quantity: 12,
					unit: "unit",
					domain: "food",
					expiresAt: null,
					baseQuantity: 12,
					baseUnit: "unit",
					status: "stable",
				},
			]);

		const result = await applyCargoImport({ DB: {} } as Env, "org-1", [
			{
				id: "cargo-1",
				name: "milk",
				quantity: 2,
				unit: "gal",
				tags: ["dairy"],
			},
			{
				id: "cargo-2",
				name: "eggs",
				quantity: 18,
				unit: "unit",
				tags: ["dairy"],
			},
		]);

		expect(result.updated).toBe(2);
		expect(mockBatch).toHaveBeenCalledTimes(1);
		expect(resolveTagIds).toHaveBeenCalledTimes(1);
	});
});

describe("applyCargoImport creates (skipVectorPhase)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBatch.mockResolvedValue([]);
		resolveTagIds.mockResolvedValue(["tag-organic"]);
		getTagsForCargoIds.mockResolvedValue(new Map());
		upsertCargoVectors.mockResolvedValue(undefined);
		checkCapacity.mockResolvedValue({ allowed: true });
		findSimilarCargoBatch.mockResolvedValue(
			new Map([
				[
					"oat milk",
					[{ itemId: "fuzzy-1", itemName: "oat milk", score: 0.99 }],
				],
			]),
		);
	});

	it("creates rows without calling findSimilarCargoBatch", async () => {
		// applyCargoImport: existing id scan (empty org)
		// ingestCargoItems: fetchOrgCargoIndex (empty)
		mockSelectWhere.mockResolvedValue([]);

		const result = await applyCargoImport({ DB: {} } as Env, "org-1", [
			{
				name: "oat milk",
				quantity: 1,
				unit: "l",
				domain: "food",
				tags: ["organic"],
			},
			{
				name: "spinach",
				quantity: 200,
				unit: "g",
				domain: "food",
			},
		]);

		expect(result.imported).toBe(2);
		expect(result.updated).toBe(0);
		expect(result.errors).toEqual([]);
		expect(findSimilarCargoBatch).not.toHaveBeenCalled();
		expect(upsertCargoVectors).toHaveBeenCalled();
		expect(checkCapacity).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			"cargo",
			2,
		);
		expect(mockBatch).toHaveBeenCalled();
	});

	it("resolves create tags in one batch instead of per row", async () => {
		mockSelectWhere.mockResolvedValue([]);
		resolveTagIds.mockResolvedValue(["tag-a", "tag-b"]);

		const result = await applyCargoImport({ DB: {} } as Env, "org-1", [
			{
				name: "apples",
				quantity: 3,
				unit: "unit",
				domain: "food",
				tags: ["produce", "fresh"],
			},
			{
				name: "bananas",
				quantity: 6,
				unit: "unit",
				domain: "food",
				tags: ["produce"],
			},
		]);

		expect(result.imported).toBe(2);
		expect(findSimilarCargoBatch).not.toHaveBeenCalled();
		// All create tags resolved once (deduped), not once per cargo row.
		expect(resolveTagIds).toHaveBeenCalledTimes(1);
		expect(resolveTagIds).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			expect.arrayContaining(["produce", "fresh"]),
		);
	});
});
