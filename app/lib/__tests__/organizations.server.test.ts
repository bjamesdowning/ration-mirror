import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "~/db/schema";

const mockBatch = vi.fn();
const mockDeleteWhere = vi.fn();
const mockUpdateWhere = vi.fn();
const mockSelectLimit = vi.fn();
const mockSelectOffset = vi.fn();
const deleteCargoVectors = vi.fn();
const deleteR2Prefix = vi.fn();

vi.mock("~/lib/vector.server", () => ({
	deleteCargoVectors: (...args: unknown[]) => deleteCargoVectors(...args),
}));

vi.mock("~/lib/r2-cleanup.server", () => ({
	deleteR2Prefix: (...args: unknown[]) => deleteR2Prefix(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: mockSelectLimit.mockReturnValue({
						offset: mockSelectOffset,
					}),
				})),
			})),
		})),
		delete: vi.fn(() => ({
			where: mockDeleteWhere.mockResolvedValue(undefined),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: mockUpdateWhere.mockResolvedValue(undefined),
			})),
		})),
		batch: mockBatch,
	})),
}));

import { deleteOrganization } from "../organizations.server";

const ORG_TABLES = [
	schema.cargo,
	schema.meal,
	schema.activeMealSelection,
	schema.activeCargoSelection,
	schema.supplyList,
	schema.supplySnooze,
	schema.mealPlan,
	schema.manifestSupplyDay,
	schema.tag,
	schema.ledger,
	schema.invitation,
	schema.agentRegistration,
	schema.member,
	schema.organization,
] as const;

describe("deleteOrganization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBatch.mockResolvedValue(undefined);
		mockSelectOffset.mockResolvedValue([]);
		deleteCargoVectors.mockResolvedValue(undefined);
		deleteR2Prefix.mockResolvedValue(undefined);
	});

	it("deletes all org-scoped tables and cleans up vectorize + R2", async () => {
		mockSelectOffset.mockResolvedValueOnce([{ id: "cargo-1" }]);

		await deleteOrganization({ DB: {}, STORAGE: {} } as Env, "org-1");

		expect(deleteCargoVectors).toHaveBeenCalledWith({ DB: {}, STORAGE: {} }, [
			"cargo-1",
		]);
		expect(mockDeleteWhere).toHaveBeenCalled();
		expect(mockBatch).toHaveBeenCalledTimes(1);

		const batchArgs = mockBatch.mock.calls[0][0] as unknown[];
		expect(batchArgs).toHaveLength(ORG_TABLES.length + 1);
		expect(deleteR2Prefix).toHaveBeenCalledWith({}, "organizations/org-1/");
	});
});
