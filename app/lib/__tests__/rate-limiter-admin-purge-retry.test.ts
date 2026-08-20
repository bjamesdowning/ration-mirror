import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "../rate-limiter.server";

describe("RATE_LIMITS admin_purge_retry", () => {
	it("is fail-closed and low QPS", () => {
		expect(RATE_LIMITS.admin_purge_retry.maxRequests).toBe(5);
		expect(RATE_LIMITS.admin_purge_retry.windowMs).toBe(60_000);
		expect(RATE_LIMITS.admin_purge_retry.failClosed).toBe(true);
		expect(RATE_LIMITS.admin_purge_retry.keyPrefix).toBe(
			"rate:admin_purge_retry",
		);
	});
});
