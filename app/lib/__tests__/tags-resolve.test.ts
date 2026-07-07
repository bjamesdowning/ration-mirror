import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBatch = vi.fn();
const mockSelectWhere = vi.fn();
const mockInsertValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: mockSelectWhere,
			})),
		})),
		insert: vi.fn(() => ({
			values: mockInsertValues.mockReturnValue({
				onConflictDoNothing: mockOnConflictDoNothing,
			}),
		})),
		batch: mockBatch,
	})),
}));

import { resolveTagIds } from "../tags.server";

describe("resolveTagIds", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBatch.mockResolvedValue([]);
		mockOnConflictDoNothing.mockReturnValue({});
	});

	it("returns existing tag ids without inserting when all slugs exist", async () => {
		mockSelectWhere.mockResolvedValueOnce([
			{ id: "tag-1", slug: "weeknight" },
			{ id: "tag-2", slug: "freezer" },
		]);

		const ids = await resolveTagIds({} as D1Database, "org-1", [
			"weeknight",
			"freezer",
		]);

		expect(ids).toEqual(["tag-1", "tag-2"]);
		expect(mockBatch).not.toHaveBeenCalled();
		expect(mockSelectWhere).toHaveBeenCalledTimes(1);
	});

	it("batch inserts missing slugs then resolves canonical ids", async () => {
		mockSelectWhere
			.mockResolvedValueOnce([{ id: "tag-1", slug: "weeknight" }])
			.mockResolvedValueOnce([
				{ id: "tag-1", slug: "weeknight" },
				{ id: "tag-2", slug: "freezer" },
			]);

		const ids = await resolveTagIds({} as D1Database, "org-1", [
			"weeknight",
			"freezer",
		]);

		expect(ids).toEqual(["tag-1", "tag-2"]);
		expect(mockBatch).toHaveBeenCalledTimes(1);
		expect(mockInsertValues).toHaveBeenCalledWith([
			expect.objectContaining({
				organizationId: "org-1",
				slug: "freezer",
				name: "Freezer",
			}),
		]);
	});

	it("throws when a missing slug cannot be resolved after insert", async () => {
		mockSelectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

		await expect(
			resolveTagIds({} as D1Database, "org-1", ["orphan"]),
		).rejects.toThrow("tag_create_failed");
	});
});
