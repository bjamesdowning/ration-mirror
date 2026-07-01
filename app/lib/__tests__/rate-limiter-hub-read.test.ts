import { describe, expect, it } from "vitest";
import { createMockKV } from "~/test/helpers/mock-env";
import { checkRateLimit, RATE_LIMITS } from "../rate-limiter.server";

describe("RATE_LIMITS hub_read", () => {
	it("matches the cargo_list/meal_list read tier class", () => {
		expect(RATE_LIMITS.hub_read.maxRequests).toBe(60);
		expect(RATE_LIMITS.hub_read.windowMs).toBe(60_000);
		expect(RATE_LIMITS.hub_read.keyPrefix).toBe("rate:hub_read");
	});

	it("blocks the 61st call within the window and allows the first 60", async () => {
		const kv = createMockKV();
		const identifier = `hub-read-test-${crypto.randomUUID()}`;

		for (let i = 0; i < 60; i++) {
			const result = await checkRateLimit(kv, "hub_read", identifier);
			expect(result.allowed).toBe(true);
		}

		const blocked = await checkRateLimit(kv, "hub_read", identifier);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});
});
