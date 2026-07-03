import { describe, expect, it } from "vitest";
import {
	computeActivationRate,
	computeMedian,
	computeStickiness,
	mergeAiBurnRows,
	normalizeLedgerReason,
} from "../admin-metrics.server";

describe("computeMedian", () => {
	it("returns 0 for empty array", () => {
		expect(computeMedian([])).toBe(0);
	});
	it("returns middle value for odd length", () => {
		expect(computeMedian([3, 1, 2])).toBe(2);
	});
	it("returns average of two middle values for even length", () => {
		expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
	});
	it("includes zeros in distribution", () => {
		expect(computeMedian([0, 0, 10])).toBe(0);
	});
});

describe("normalizeLedgerReason", () => {
	it("strips idempotency suffix after colon", () => {
		expect(normalizeLedgerReason("top-up:abc-123")).toBe("top-up");
	});
	it("returns reason unchanged when no suffix", () => {
		expect(normalizeLedgerReason("Visual Scan")).toBe("Visual Scan");
	});
});

describe("computeActivationRate", () => {
	it("returns 0 when total is 0", () => {
		expect(computeActivationRate(0, 0)).toBe(0);
	});
	it("computes percentage correctly", () => {
		expect(computeActivationRate(42, 120)).toBeCloseTo(35);
	});
});

describe("computeStickiness", () => {
	it("returns 0 when MAU is 0", () => {
		expect(computeStickiness(10, 0)).toBe(0);
	});
	it("computes DAU/MAU ratio as percentage", () => {
		expect(computeStickiness(12, 100)).toBe(12);
	});
});

describe("mergeAiBurnRows", () => {
	it("merges 24h and 7d rows by normalized reason", () => {
		const rows24h = [
			{ reason: "Visual Scan", credits: 10, calls: 2 },
			{ reason: "top-up:uuid-1", credits: 5, calls: 1 },
		];
		const rows7d = [
			{ reason: "Visual Scan", credits: 50, calls: 10 },
			{ reason: "Meal Generation", credits: 30, calls: 5 },
		];
		const result = mergeAiBurnRows(rows24h, rows7d);
		const scan = result.find((r) => r.feature === "Visual Scan");
		expect(scan?.credits24h).toBe(10);
		expect(scan?.credits7d).toBe(50);
		expect(scan?.calls24h).toBe(2);
		const topUp = result.find((r) => r.feature === "top-up");
		expect(topUp?.credits24h).toBe(5);
	});

	it("sorts by 7d credits descending and respects topN", () => {
		const rows7d = [
			{ reason: "A", credits: 10, calls: 1 },
			{ reason: "B", credits: 50, calls: 1 },
			{ reason: "C", credits: 30, calls: 1 },
		];
		const result = mergeAiBurnRows([], rows7d, 2);
		expect(result).toHaveLength(2);
		expect(result[0].feature).toBe("B");
		expect(result[1].feature).toBe("C");
	});
});
