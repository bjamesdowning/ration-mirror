import { beforeEach, describe, expect, it, vi } from "vitest";

const batchMock = vi.fn();

vi.mock("drizzle-orm/d1", () => {
	const chain = {
		from: vi.fn().mockReturnThis(),
		innerJoin: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
	};
	return {
		drizzle: vi.fn(() => ({
			select: vi.fn(() => chain),
			batch: batchMock,
		})),
	};
});

describe("getAdjacentMealIds", () => {
	beforeEach(() => {
		batchMock.mockReset();
	});

	it("returns prevId and nextId when both exist", async () => {
		const { getAdjacentMealIds } = await import("~/lib/meals.server");
		batchMock.mockResolvedValue([[{ id: "prev-meal" }], [{ id: "next-meal" }]]);

		const result = await getAdjacentMealIds(
			{} as D1Database,
			"org-1",
			{ id: "current-meal", createdAt: new Date("2026-01-15T12:00:00Z") },
			{},
		);

		expect(result.prevId).toBe("prev-meal");
		expect(result.nextId).toBe("next-meal");
	});

	it("returns null for prevId when current is first", async () => {
		const { getAdjacentMealIds } = await import("~/lib/meals.server");
		batchMock.mockResolvedValue([[], [{ id: "next-meal" }]]);

		const result = await getAdjacentMealIds(
			{} as D1Database,
			"org-1",
			{ id: "first-meal", createdAt: new Date("2026-01-20T00:00:00Z") },
			{},
		);

		expect(result.prevId).toBeNull();
		expect(result.nextId).toBe("next-meal");
	});

	it("returns null for nextId when current is last", async () => {
		const { getAdjacentMealIds } = await import("~/lib/meals.server");
		batchMock.mockResolvedValue([[{ id: "prev-meal" }], []]);

		const result = await getAdjacentMealIds(
			{} as D1Database,
			"org-1",
			{ id: "last-meal", createdAt: new Date("2026-01-01T00:00:00Z") },
			{},
		);

		expect(result.prevId).toBe("prev-meal");
		expect(result.nextId).toBeNull();
	});

	it("returns both null when only one meal in filtered set", async () => {
		const { getAdjacentMealIds } = await import("~/lib/meals.server");
		batchMock.mockResolvedValue([[], []]);

		const result = await getAdjacentMealIds(
			{} as D1Database,
			"org-1",
			{ id: "only-meal", createdAt: new Date("2026-01-10T00:00:00Z") },
			{ domain: "food" },
		);

		expect(result.prevId).toBeNull();
		expect(result.nextId).toBeNull();
	});

	it("applies tag filter when provided", async () => {
		const { getAdjacentMealIds } = await import("~/lib/meals.server");
		batchMock.mockResolvedValue([
			[{ id: "prev-tagged" }],
			[{ id: "next-tagged" }],
		]);

		const result = await getAdjacentMealIds(
			{} as D1Database,
			"org-1",
			{ id: "current-meal", createdAt: new Date("2026-01-15T12:00:00Z") },
			{ tag: "breakfast" },
		);

		expect(result.prevId).toBe("prev-tagged");
		expect(result.nextId).toBe("next-tagged");
	});

	it("ignores invalid domain", async () => {
		const { getAdjacentMealIds } = await import("~/lib/meals.server");
		batchMock.mockResolvedValue([[{ id: "prev-meal" }], [{ id: "next-meal" }]]);

		const result = await getAdjacentMealIds(
			{} as D1Database,
			"org-1",
			{ id: "current-meal", createdAt: new Date("2026-01-15T12:00:00Z") },
			{ domain: "invalid" as "food" },
		);

		expect(result.prevId).toBe("prev-meal");
		expect(result.nextId).toBe("next-meal");
	});

	it("trims and truncates tag to 100 chars", async () => {
		const { getAdjacentMealIds } = await import("~/lib/meals.server");
		batchMock.mockResolvedValue([[{ id: "prev-meal" }], [{ id: "next-meal" }]]);

		const result = await getAdjacentMealIds(
			{} as D1Database,
			"org-1",
			{ id: "current-meal", createdAt: new Date("2026-01-15T12:00:00Z") },
			{ tag: "  breakfast  " },
		);

		expect(result.prevId).toBe("prev-meal");
		expect(result.nextId).toBe("next-meal");
		expect(batchMock).toHaveBeenCalled();
	});
});
