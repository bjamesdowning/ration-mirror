import { beforeEach, describe, expect, it, vi } from "vitest";

const batchMock = vi.fn();

vi.mock("drizzle-orm/d1", () => {
	const chain = {
		from: vi.fn().mockReturnThis(),
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

describe("getAdjacentCargoIds", () => {
	beforeEach(() => {
		batchMock.mockReset();
	});

	it("returns prevId and nextId when both exist", async () => {
		const { getAdjacentCargoIds } = await import("~/lib/cargo.server");
		batchMock.mockResolvedValue([[{ id: "prev-uuid" }], [{ id: "next-uuid" }]]);

		const result = await getAdjacentCargoIds(
			{} as D1Database,
			"org-1",
			{ id: "current-uuid", createdAt: new Date("2026-01-15T12:00:00Z") },
			{},
		);

		expect(result.prevId).toBe("prev-uuid");
		expect(result.nextId).toBe("next-uuid");
	});

	it("returns null for prevId when current is first", async () => {
		const { getAdjacentCargoIds } = await import("~/lib/cargo.server");
		batchMock.mockResolvedValue([[], [{ id: "next-uuid" }]]);

		const result = await getAdjacentCargoIds(
			{} as D1Database,
			"org-1",
			{ id: "first-uuid", createdAt: new Date("2026-01-20T00:00:00Z") },
			{},
		);

		expect(result.prevId).toBeNull();
		expect(result.nextId).toBe("next-uuid");
	});

	it("returns null for nextId when current is last", async () => {
		const { getAdjacentCargoIds } = await import("~/lib/cargo.server");
		batchMock.mockResolvedValue([[{ id: "prev-uuid" }], []]);

		const result = await getAdjacentCargoIds(
			{} as D1Database,
			"org-1",
			{ id: "last-uuid", createdAt: new Date("2026-01-01T00:00:00Z") },
			{},
		);

		expect(result.prevId).toBe("prev-uuid");
		expect(result.nextId).toBeNull();
	});

	it("returns both null when only one item in filtered set", async () => {
		const { getAdjacentCargoIds } = await import("~/lib/cargo.server");
		batchMock.mockResolvedValue([[], []]);

		const result = await getAdjacentCargoIds(
			{} as D1Database,
			"org-1",
			{ id: "only-uuid", createdAt: new Date("2026-01-10T00:00:00Z") },
			{ domain: "food" },
		);

		expect(result.prevId).toBeNull();
		expect(result.nextId).toBeNull();
	});

	it("applies domain filter when provided", async () => {
		const { getAdjacentCargoIds } = await import("~/lib/cargo.server");
		batchMock.mockResolvedValue([[{ id: "prev-food" }], [{ id: "next-food" }]]);

		const result = await getAdjacentCargoIds(
			{} as D1Database,
			"org-1",
			{ id: "current-uuid", createdAt: new Date("2026-01-15T12:00:00Z") },
			{ domain: "food" },
		);

		expect(result.prevId).toBe("prev-food");
		expect(result.nextId).toBe("next-food");
	});

	it("ignores invalid domain", async () => {
		const { getAdjacentCargoIds } = await import("~/lib/cargo.server");
		batchMock.mockResolvedValue([[{ id: "prev-uuid" }], [{ id: "next-uuid" }]]);

		const result = await getAdjacentCargoIds(
			{} as D1Database,
			"org-1",
			{ id: "current-uuid", createdAt: new Date("2026-01-15T12:00:00Z") },
			{ domain: "invalid-domain" as "food" },
		);

		expect(result.prevId).toBe("prev-uuid");
		expect(result.nextId).toBe("next-uuid");
	});
});
