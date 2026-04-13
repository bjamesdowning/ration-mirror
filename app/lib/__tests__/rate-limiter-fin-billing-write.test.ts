import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "../rate-limiter.server";

describe("RATE_LIMITS fin_billing_write", () => {
	it("is stricter than fin_billing read limit", () => {
		expect(RATE_LIMITS.fin_billing_write.maxRequests).toBeLessThan(
			RATE_LIMITS.fin_billing.maxRequests,
		);
		expect(RATE_LIMITS.fin_billing_write.keyPrefix).toBe(
			"rate:fin_billing_write",
		);
	});
});
