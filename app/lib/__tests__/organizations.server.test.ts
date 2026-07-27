import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "~/db/schema";

const mockBatch = vi.fn();
const mockSelectLimit = vi.fn();
const mockSelectOffset = vi.fn();
const deleteCargoVectors = vi.fn();
const deleteR2Prefix = vi.fn();
const purgeCopilotConversationsForOrganization = vi.fn();

vi.mock("~/lib/vector.server", () => ({
	deleteCargoVectors: (...args: unknown[]) => deleteCargoVectors(...args),
}));

vi.mock("~/lib/r2-cleanup.server", () => ({
	deleteR2Prefix: (...args: unknown[]) => deleteR2Prefix(...args),
}));

vi.mock("~/lib/copilot/purge.server", () => ({
	purgeCopilotConversationsForOrganization: (...args: unknown[]) =>
		purgeCopilotConversationsForOrganization(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => {
					const thenable = Promise.resolve([]) as unknown as Promise<
						unknown[]
					> & {
						limit: typeof mockSelectLimit;
					};
					thenable.limit = mockSelectLimit.mockReturnValue({
						offset: mockSelectOffset,
					});
					return thenable;
				}),
			})),
		})),
		delete: vi.fn((table: unknown) => {
			const stmt = {
				__table: table,
				where: vi.fn(() => stmt),
			};
			return stmt;
		}),
		update: vi.fn((table: unknown) => {
			const stmt = {
				__table: table,
				set: vi.fn(() => ({
					where: vi.fn(() => stmt),
				})),
			};
			return stmt;
		}),
		batch: mockBatch,
	})),
}));

import { deleteOrganization } from "../organizations.server";

/** Expected D1 wipe order: dependents before cargo/meal (FK safety). */
const DEPENDENT_BEFORE_CARGO = [
	schema.activeMealSelection,
	schema.activeCargoSelection,
	schema.supplyList,
	schema.supplySnooze,
	schema.mealPlan,
	schema.manifestSupplyDay,
] as const;

const CARGO_AND_MEAL = [schema.cargo, schema.meal] as const;

describe("deleteOrganization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBatch.mockResolvedValue(undefined);
		mockSelectOffset.mockResolvedValue([]);
		deleteCargoVectors.mockResolvedValue(undefined);
		deleteR2Prefix.mockResolvedValue(undefined);
		purgeCopilotConversationsForOrganization.mockResolvedValue(undefined);
	});

	it("deletes all org-scoped tables and cleans up vectorize + R2", async () => {
		mockSelectOffset.mockResolvedValueOnce([{ id: "cargo-1" }]);

		await deleteOrganization({ DB: {}, STORAGE: {} } as Env, "org-1");

		expect(deleteCargoVectors).toHaveBeenCalledWith({ DB: {}, STORAGE: {} }, [
			"cargo-1",
		]);
		expect(purgeCopilotConversationsForOrganization).toHaveBeenCalled();
		expect(mockBatch).toHaveBeenCalledTimes(1);

		const batchArgs = mockBatch.mock.calls[0][0] as unknown[];
		// access (3) + dependents (6) + cargo/meal (2) + tag/ledger/agent/org (4) = 15
		expect(batchArgs).toHaveLength(15);
		expect(deleteR2Prefix).toHaveBeenCalledWith({}, "organizations/org-1/");
	});

	it("deletes supply lists and selections before cargo/meal (FK regression)", async () => {
		mockSelectOffset.mockResolvedValueOnce([]);

		await deleteOrganization({ DB: {}, STORAGE: {} } as Env, "org-1", {
			skipAccessRevocation: true,
			skipVectorize: true,
			skipR2: true,
		});

		const batchArgs = mockBatch.mock.calls[0][0] as Array<{
			__table?: unknown;
		}>;

		const tableIndex = (table: unknown) =>
			batchArgs.findIndex((stmt) => stmt.__table === table);

		for (const dependent of DEPENDENT_BEFORE_CARGO) {
			const depIdx = tableIndex(dependent);
			expect(depIdx).toBeGreaterThanOrEqual(0);
			for (const parent of CARGO_AND_MEAL) {
				expect(depIdx).toBeLessThan(tableIndex(parent));
			}
		}
	});

	it("labels D1 failures with org_wipe step", async () => {
		mockBatch.mockRejectedValueOnce(new Error("FOREIGN KEY constraint failed"));

		await expect(
			deleteOrganization({ DB: {}, STORAGE: {} } as Env, "org-1", {
				skipVectorize: true,
				skipR2: true,
			}),
		).rejects.toThrow(/org_wipe:d1:.*FOREIGN KEY/);
	});
});
