import { describe, expect, it, vi } from "vitest";
import { filterCandidatesPresentInDb } from "../resolve-food.server";

describe("filterCandidatesPresentInDb", () => {
	it("returns empty without db or candidates", async () => {
		await expect(filterCandidatesPresentInDb(undefined, [])).resolves.toEqual(
			[],
		);
		await expect(
			filterCandidatesPresentInDb(undefined, [
				{ fdcId: 1, description: "Milk" },
			]),
		).resolves.toEqual([]);
	});

	it("keeps only ids present in local food table", async () => {
		const all = vi.fn().mockResolvedValue({
			results: [{ fdcId: 10 }, { fdcId: 30 }],
		});
		const bind = vi.fn().mockReturnValue({ all });
		const prepare = vi.fn().mockReturnValue({ bind });
		const db = { prepare } as unknown as D1Database;

		const filtered = await filterCandidatesPresentInDb(db, [
			{ fdcId: 10, description: "A" },
			{ fdcId: 20, description: "B" },
			{ fdcId: 30, description: "C" },
		]);
		expect(filtered.map((c) => c.fdcId)).toEqual([10, 30]);
		expect(bind).toHaveBeenCalledWith(10, 20, 30);
	});

	it("returns empty when the presence query fails", async () => {
		const prepare = vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				all: vi.fn().mockRejectedValue(new Error("db down")),
			}),
		});
		const db = { prepare } as unknown as D1Database;
		await expect(
			filterCandidatesPresentInDb(db, [{ fdcId: 1, description: "x" }]),
		).resolves.toEqual([]);
	});
});
