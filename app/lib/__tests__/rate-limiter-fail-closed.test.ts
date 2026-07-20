import { describe, expect, it, vi } from "vitest";
import { createMockKV } from "../../test/helpers/mock-env";
import { checkRateLimit, RATE_LIMITS } from "../rate-limiter.server";

describe("RATE_LIMITS failClosed flags", () => {
	it("marks spend-sensitive buckets as fail-closed", () => {
		const failClosedBuckets = [
			"scan",
			"generate_meal",
			"recipe_import",
			"plan_week",
			"meal_match",
			"mcp_search",
			"copilot",
			"copilot_connect",
			"hub_read",
			"mcp_supply_sync",
			"inventory_batch",
		] as const;

		for (const bucket of failClosedBuckets) {
			expect(RATE_LIMITS[bucket].failClosed).toBe(true);
		}
	});

	it("keeps read-light buckets fail-open", () => {
		expect(RATE_LIMITS.inventory_mutation.failClosed).toBeUndefined();
		expect(RATE_LIMITS.search.failClosed).toBeUndefined();
		expect(RATE_LIMITS.status_poll.failClosed).toBeUndefined();
	});
});

describe("checkRateLimit KV failure modes", () => {
	it("denies spend buckets when KV get throws", async () => {
		const kv = createMockKV();
		vi.mocked(kv.get).mockRejectedValueOnce(new Error("kv unavailable"));

		const result = await checkRateLimit(
			kv,
			"scan",
			`fail-closed-scan-${crypto.randomUUID()}`,
		);

		expect(result.allowed).toBe(false);
		expect(result.retryAfter).toBe(5);
		expect(result.remaining).toBe(0);
	});

	it("allows non-spend buckets when KV get throws", async () => {
		const kv = createMockKV();
		vi.mocked(kv.get).mockRejectedValueOnce(new Error("kv unavailable"));

		const result = await checkRateLimit(
			kv,
			"inventory_mutation",
			`fail-open-inv-${crypto.randomUUID()}`,
		);

		expect(result.allowed).toBe(true);
	});

	it("denies spend buckets when KV put throws", async () => {
		const kv = createMockKV();
		vi.mocked(kv.get).mockResolvedValueOnce(null as never);
		vi.mocked(kv.put).mockRejectedValueOnce(new Error("kv put failed"));

		const result = await checkRateLimit(
			kv,
			"mcp_search",
			`fail-closed-put-${crypto.randomUUID()}`,
		);

		expect(result.allowed).toBe(false);
		expect(result.retryAfter).toBe(5);
	});
});
