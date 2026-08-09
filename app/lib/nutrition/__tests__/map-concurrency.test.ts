import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../map-concurrency";

describe("mapWithConcurrency", () => {
	it("preserves order and never exceeds the limit", async () => {
		let inflight = 0;
		let maxInflight = 0;
		const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
			inflight += 1;
			maxInflight = Math.max(maxInflight, inflight);
			await new Promise((r) => setTimeout(r, 5));
			inflight -= 1;
			return n * 10;
		});
		expect(results).toEqual([10, 20, 30, 40, 50]);
		expect(maxInflight).toBeLessThanOrEqual(2);
	});

	it("returns empty for empty input", async () => {
		expect(await mapWithConcurrency([], 3, async (x) => x)).toEqual([]);
	});
});
