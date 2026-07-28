import { beforeEach, describe, expect, it, vi } from "vitest";

const selectLimit = vi.fn();
const selectWhere = vi.fn();
const selectFrom = vi.fn(() => ({ where: selectWhere }));
const selectMock = vi.fn(() => ({ from: selectFrom }));
const deleteWhere = vi.fn();
const deleteMock = vi.fn(() => ({ where: deleteWhere }));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: selectMock,
		delete: deleteMock,
	})),
}));

describe("deleteMeal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectFrom.mockImplementation(() => ({ where: selectWhere }));
		selectWhere.mockImplementation(() => ({ limit: selectLimit }));
		deleteMock.mockImplementation(() => ({ where: deleteWhere }));
		deleteWhere.mockResolvedValue(undefined);
	});

	it("returns deleted:false when meal is not owned by the org", async () => {
		selectLimit.mockResolvedValueOnce([]);
		const { deleteMeal } = await import("~/lib/meals.server");
		const result = await deleteMeal({} as D1Database, "org-1", "meal-x");
		expect(result).toEqual({ deleted: false, deletedPlanEntryCount: 0 });
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it("counts linked plan entries then deletes the owned meal", async () => {
		selectLimit.mockResolvedValueOnce([{ id: "meal-1" }]);
		// second select (plan entries) has no .limit — where resolves the array
		selectWhere
			.mockImplementationOnce(() => ({ limit: selectLimit }))
			.mockImplementationOnce(() =>
				Promise.resolve([{ id: "e1" }, { id: "e2" }]),
			);

		const { deleteMeal } = await import("~/lib/meals.server");
		const result = await deleteMeal({} as D1Database, "org-1", "meal-1");
		expect(result).toEqual({ deleted: true, deletedPlanEntryCount: 2 });
		expect(deleteMock).toHaveBeenCalled();
		expect(deleteWhere).toHaveBeenCalled();
	});
});
