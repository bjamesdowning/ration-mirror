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
const deleteWhere = vi.fn().mockResolvedValue(undefined);
const deleteFn = vi.fn(() => ({
	where: deleteWhere,
}));

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
		delete: deleteFn,
		batch,
	})),
}));

describe("applyUndoRecord", () => {
	beforeEach(() => {
		batch.mockClear();
		planSelect.mockReset();
		deleteFn.mockClear();
		deleteWhere.mockClear();
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
				userId: "user-1",
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
		expect(deleteFn).not.toHaveBeenCalled();
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
			userId: "user-1",
			deductions: [{ cargoId: "c1", quantity: 1 }],
		});

		expect(buildKitchenEventDeleteStmts).not.toHaveBeenCalled();
		expect(batch).toHaveBeenCalledTimes(1);
	});

	it("deletes linked nutrition intake for legacy manifest_consume undo", async () => {
		planSelect.mockResolvedValue([{ id: "plan-1" }]);
		const { applyUndoRecord } = await import("../cook-reversal.server");
		await applyUndoRecord({} as D1Database, "org-1", {
			kind: "manifest_consume",
			userId: "user-1",
			planId: "plan-1",
			manifestEntryIds: ["entry-1"],
			deductions: [{ cargoId: "c1", quantity: 1 }],
			eventIds: ["evt-1"],
			intakeIds: ["intake-1"],
		});

		expect(deleteFn).toHaveBeenCalled();
		expect(buildKitchenEventDeleteStmts).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			["evt-1"],
		);
		expect(batch).toHaveBeenCalled();
	});

	it("clears cookedAt/consumedAt for manifest_cook without touching intake", async () => {
		planSelect.mockResolvedValue([{ id: "plan-1" }]);
		const updateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		vi.doMock("drizzle-orm/d1", () => ({
			drizzle: vi.fn(() => ({
				select: vi.fn(() => ({
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					limit: planSelect,
				})),
				update: vi.fn(() => ({ set: updateSet })),
				delete: deleteFn,
				batch,
			})),
		}));

		const { applyUndoRecord } = await import("../cook-reversal.server");
		await applyUndoRecord({} as D1Database, "org-1", {
			kind: "manifest_cook",
			userId: "user-1",
			planId: "plan-1",
			manifestEntryIds: ["entry-1"],
			deductions: [{ cargoId: "c1", quantity: 1 }],
			eventIds: ["evt-cook"],
		});

		expect(deleteFn).not.toHaveBeenCalled();
		expect(updateSet).toHaveBeenCalledWith({
			cookedAt: null,
			cookedByUserId: null,
			consumedAt: null,
		});
		expect(buildKitchenEventDeleteStmts).toHaveBeenCalled();
	});

	it("deletes auto-created entries on manifest_cook undo", async () => {
		planSelect.mockResolvedValue([{ id: "plan-1" }]);
		const updateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		const deleteWhere = vi.fn().mockResolvedValue(undefined);
		deleteFn.mockReturnValue({ where: deleteWhere });
		vi.doMock("drizzle-orm/d1", () => ({
			drizzle: vi.fn(() => ({
				select: vi.fn(() => ({
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					limit: planSelect,
				})),
				update: vi.fn(() => ({ set: updateSet })),
				delete: deleteFn,
				batch,
			})),
		}));

		const { applyUndoRecord } = await import("../cook-reversal.server");
		await applyUndoRecord({} as D1Database, "org-1", {
			kind: "manifest_cook",
			userId: "user-1",
			planId: "plan-1",
			manifestEntryIds: ["entry-new"],
			deleteManifestEntryIds: ["entry-new"],
			deductions: [],
			eventIds: ["evt-cook"],
		});

		expect(deleteFn).toHaveBeenCalled();
		expect(updateSet).not.toHaveBeenCalled();
	});

	it("voids intake and restores prior row for manifest_intake without cargo", async () => {
		const updateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		vi.doMock("drizzle-orm/d1", () => ({
			drizzle: vi.fn(() => ({
				select: vi.fn(() => ({
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					limit: planSelect,
				})),
				update: vi.fn(() => ({ set: updateSet })),
				delete: deleteFn,
				batch,
			})),
		}));

		buildCargoDeductionStatements.mockClear();
		const { applyUndoRecord } = await import("../cook-reversal.server");
		await applyUndoRecord({} as D1Database, "org-1", {
			kind: "manifest_intake",
			userId: "user-1",
			deductions: [],
			intakeIds: ["new-intake"],
			restoreIntakeId: "prior-intake",
		});

		expect(buildCargoDeductionStatements).not.toHaveBeenCalled();
		expect(buildKitchenEventDeleteStmts).not.toHaveBeenCalled();
		expect(updateSet).toHaveBeenCalled();
		expect(batch).toHaveBeenCalled();
	});
});
