import { beforeEach, describe, expect, it, vi } from "vitest";

const eventStatement = { kind: "event-insert" };
const deleteStatement = { kind: "cargo-delete" };
const batchMock = vi.fn();
const limitMock = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: limitMock,
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => deleteStatement),
		})),
		batch: batchMock,
	})),
}));

vi.mock("~/lib/cargo-delete.server", () => ({
	clearSupplyItemCargoRefs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/kitchen-events.server", () => ({
	buildCargoJettisonedEvent: vi.fn((input) => input),
	buildKitchenEventInserts: vi.fn(() => ({
		stmts: [eventStatement],
		eventIds: ["event-1"],
		budgeted: [],
	})),
	buildSupplyDockedEvent: vi.fn(),
}));

vi.mock("~/lib/vector.server", () => ({
	deleteCargoVectors: vi.fn().mockResolvedValue(undefined),
	findSimilarCargoBatch: vi.fn(),
	upsertCargoVector: vi.fn(),
	upsertCargoVectors: vi.fn(),
	SIMILARITY_THRESHOLDS: {},
}));

vi.mock("~/lib/readiness-cache.server", () => ({
	bumpReadinessCacheVersions: vi.fn().mockResolvedValue(undefined),
}));

describe("jettisonItem", () => {
	beforeEach(() => {
		batchMock.mockReset();
		batchMock.mockResolvedValue([]);
		limitMock.mockReset();
		limitMock.mockResolvedValue([
			{
				id: "cargo-1",
				name: "Milk",
				quantity: 1,
				unit: "l",
				domain: "food",
				expiresAt: null,
			},
		]);
	});

	it("inserts the Flight Recorder event before deleting its cargo FK", async () => {
		const { jettisonItem } = await import("~/lib/cargo.server");

		await jettisonItem(
			{ DB: {}, RATION_KV: {} } as unknown as Env,
			"org-1",
			"cargo-1",
		);

		expect(batchMock).toHaveBeenCalledTimes(1);
		expect(batchMock).toHaveBeenCalledWith([eventStatement, deleteStatement]);
	});
});
