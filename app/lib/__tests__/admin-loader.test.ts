import { describe, expect, it } from "vitest";
import {
	ADMIN_D1_CONCURRENCY,
	mapWithConcurrency,
	runSafeMetric,
} from "../admin-loader.server";

describe("mapWithConcurrency", () => {
	it("returns results in input order", async () => {
		const items = [1, 2, 3, 4, 5];
		const results = await mapWithConcurrency(
			items,
			2,
			async (value) => value * 2,
		);
		expect(results).toEqual([2, 4, 6, 8, 10]);
	});

	it("never exceeds the concurrency limit", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const items = Array.from({ length: 12 }, (_, index) => index);

		await mapWithConcurrency(items, ADMIN_D1_CONCURRENCY, async (value) => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight -= 1;
			return value;
		});

		expect(maxInFlight).toBeLessThanOrEqual(ADMIN_D1_CONCURRENCY);
	});

	it("returns an empty array for empty input", async () => {
		await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
	});
});

describe("runSafeMetric", () => {
	it("returns ok data on success", async () => {
		await expect(
			runSafeMetric("test", async () => ({ count: 3 })),
		).resolves.toEqual({ status: "ok", data: { count: 3 } });
	});

	it("returns error status without throwing", async () => {
		await expect(
			runSafeMetric("test", async () => {
				throw new Error("boom");
			}),
		).resolves.toEqual({ status: "error" });
	});
});
