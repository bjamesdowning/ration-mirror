import { beforeEach, describe, expect, it, vi } from "vitest";
import { supplyItem } from "~/db/schema";
import { D1_SAFE_BOUND_PARAMS } from "~/lib/query-utils.server";

const mockUpdateWhere = vi.fn();
const mockSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock("drizzle-orm", async (importOriginal) => {
	const actual = await importOriginal<typeof import("drizzle-orm")>();
	return {
		...actual,
		inArray: vi.fn((col, values: string[]) => ({
			__type: "inArray",
			col,
			values,
		})),
	};
});

import { clearSupplyItemCargoRefs } from "../cargo-delete.server";

describe("clearSupplyItemCargoRefs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateWhere.mockResolvedValue(undefined);
	});

	it("no-ops on empty cargo id list", async () => {
		await clearSupplyItemCargoRefs({ update: mockUpdate } as never, []);
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("nulls source_cargo_id for a single chunk", async () => {
		await clearSupplyItemCargoRefs({ update: mockUpdate } as never, [
			"c1",
			"c2",
		]);

		expect(mockUpdate).toHaveBeenCalledWith(supplyItem);
		expect(mockSet).toHaveBeenCalledWith({ sourceCargoId: null });
		expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
		const whereArg = mockUpdateWhere.mock.calls[0][0] as {
			values: string[];
		};
		expect(whereArg.values).toEqual(["c1", "c2"]);
	});

	it("chunks cargo ids under D1 safe bind limit", async () => {
		const ids = Array.from(
			{ length: D1_SAFE_BOUND_PARAMS + 5 },
			(_, i) => `cargo-${i}`,
		);

		await clearSupplyItemCargoRefs({ update: mockUpdate } as never, ids);

		expect(mockUpdateWhere).toHaveBeenCalledTimes(2);
		const first = mockUpdateWhere.mock.calls[0][0] as { values: string[] };
		const second = mockUpdateWhere.mock.calls[1][0] as { values: string[] };
		expect(first.values).toHaveLength(D1_SAFE_BOUND_PARAMS);
		expect(second.values).toHaveLength(5);
	});
});
