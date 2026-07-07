import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockBatch,
	mockSelectWhere,
	mockUpdateSet,
	mockUpdateWhere,
	mockDeleteWhere,
	mockInsertValues,
	resolveTagIds,
	upsertCargoVectors,
} = vi.hoisted(() => ({
	mockBatch: vi.fn(),
	mockSelectWhere: vi.fn(),
	mockUpdateSet: vi.fn(),
	mockUpdateWhere: vi.fn(),
	mockDeleteWhere: vi.fn(),
	mockInsertValues: vi.fn(),
	resolveTagIds: vi.fn(),
	upsertCargoVectors: vi.fn(),
}));

vi.mock("../tags.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../tags.server")>();
	return {
		...actual,
		resolveTagIds,
	};
});

vi.mock("../vector.server", () => ({
	deleteCargoVectors: vi.fn(),
	findSimilarCargoBatch: vi.fn(),
	SIMILARITY_THRESHOLDS: {},
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
		upsertCargoVectors.mockResolvedValue(undefined);
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
