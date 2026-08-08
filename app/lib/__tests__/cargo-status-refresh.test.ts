import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshStaleCargoStatuses } from "~/lib/cargo.server";

describe("refreshStaleCargoStatuses", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
	});

	it("runs three status UPDATEs with unix-second bounds and sums changes", async () => {
		const run = vi
			.fn()
			.mockResolvedValueOnce({ meta: { changes: 2 } })
			.mockResolvedValueOnce({ meta: { changes: 1 } })
			.mockResolvedValueOnce({ meta: { changes: 3 } });
		const bind = vi.fn().mockReturnValue({ run });
		const prepare = vi.fn().mockReturnValue({ bind });
		const db = { prepare } as unknown as D1Database;

		const updated = await refreshStaleCargoStatuses(db);

		expect(updated).toBe(6);
		expect(prepare).toHaveBeenCalledTimes(3);
		expect(prepare.mock.calls[0]?.[0]).toContain("biohazard");
		expect(prepare.mock.calls[1]?.[0]).toContain("decay_imminent");
		expect(prepare.mock.calls[2]?.[0]).toContain("'stable'");

		// now = 2026-07-14T12:00Z → nowUnix; startOfToday = 2026-07-14T00:00Z; decayEnd = +2 days
		expect(bind.mock.calls[0]).toEqual([1784030400, 1783987200]);
		expect(bind.mock.calls[1]).toEqual([1784030400, 1783987200, 1784160000]);
		expect(bind.mock.calls[2]).toEqual([1784030400, 1784160000]);
	});
});
