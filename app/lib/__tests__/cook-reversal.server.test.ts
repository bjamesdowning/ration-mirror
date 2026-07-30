import { beforeEach, describe, expect, it, vi } from "vitest";

const buildCargoDeductionStatements = vi.fn();
const buildKitchenEventDeleteStmts = vi.fn();
const bumpReadinessCacheVersions = vi.fn();

vi.mock("../cargo-deduction.server", () => ({
	buildCargoDeductionStatements: (...args: unknown[]) =>
		buildCargoDeductionStatements(...args),
}));

vi.mock("../kitchen-events.server", () => ({
	buildKitchenEventDeleteStmts: (...args: unknown[]) =>
		buildKitchenEventDeleteStmts(...args),
}));

vi.mock("../readiness-cache.server", () => ({
	bumpReadinessCacheVersions: (...args: unknown[]) =>
		bumpReadinessCacheVersions(...args),
}));

const batch = vi.fn().mockResolvedValue(undefined);
const planSelect = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: planSelect,
		})),
		update: vi.fn(() => ({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		})),
		batch,
	})),
}));

describe("applyUndoRecord", () => {
	beforeEach(() => {
		batch.mockClear();
		planSelect.mockReset();
		buildCargoDeductionStatements.mockReset();
		buildKitchenEventDeleteStmts.mockReset();
		bumpReadinessCacheVersions.mockReset();
		buildCargoDeductionStatements.mockResolvedValue([{ kind: "restore" }]);
		buildKitchenEventDeleteStmts.mockReturnValue([{ kind: "delete-events" }]);
		bumpReadinessCacheVersions.mockResolvedValue(undefined);
		vi.resetModules();
	});

	it("batches cargo restore and deletes kitchen events for cook undo", async () => {
		const { applyUndoRecord } = await import("../cook-reversal.server");
		await applyUndoRecord(
			{} as D1Database,
			"org-1",
			{
				kind: "cook",
				deductions: [{ cargoId: "c1", quantity: 2 }],
				eventIds: ["evt-1", "evt-2"],
			},
			{ kv: {} as KVNamespace },
		);

		expect(buildKitchenEventDeleteStmts).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			["evt-1", "evt-2"],
		);
		expect(batch).toHaveBeenCalledTimes(1);
		const stmts = batch.mock.calls[0]?.[0] as unknown[];
		expect(stmts).toEqual(
			expect.arrayContaining([{ kind: "restore" }, { kind: "delete-events" }]),
		);
		expect(bumpReadinessCacheVersions).toHaveBeenCalled();
	});

	it("skips event deletes when eventIds are absent", async () => {
		const { applyUndoRecord } = await import("../cook-reversal.server");
		await applyUndoRecord({} as D1Database, "org-1", {
			kind: "cook",
			deductions: [{ cargoId: "c1", quantity: 1 }],
		});

		expect(buildKitchenEventDeleteStmts).not.toHaveBeenCalled();
		expect(batch).toHaveBeenCalledTimes(1);
	});
});
