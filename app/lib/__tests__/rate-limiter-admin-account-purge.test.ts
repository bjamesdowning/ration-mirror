import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "../rate-limiter.server";

describe("RATE_LIMITS admin_account_purge", () => {
	it("is fail-closed and low QPS", () => {
		expect(RATE_LIMITS.admin_account_purge.maxRequests).toBe(5);
		expect(RATE_LIMITS.admin_account_purge.windowMs).toBe(60_000);
		expect(RATE_LIMITS.admin_account_purge.failClosed).toBe(true);
		expect(RATE_LIMITS.admin_account_purge.keyPrefix).toBe(
			"rate:admin_account_purge",
		);
	});
});
