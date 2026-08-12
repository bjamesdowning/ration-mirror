import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "../rate-limiter.server";

describe("RATE_LIMITS cargo_nutrition_refresh", () => {
	it("is fail-closed and stricter than batch nutrition_resolve", () => {
		expect(RATE_LIMITS.cargo_nutrition_refresh.maxRequests).toBe(10);
		expect(RATE_LIMITS.cargo_nutrition_refresh.windowMs).toBe(60_000);
		expect(RATE_LIMITS.cargo_nutrition_refresh.keyPrefix).toBe(
			"rate:cargo_nutrition_refresh",
		);
		expect(RATE_LIMITS.cargo_nutrition_refresh.failClosed).toBe(true);
		expect(RATE_LIMITS.cargo_nutrition_refresh.maxRequests).toBeLessThan(
			RATE_LIMITS.nutrition_resolve.maxRequests,
		);
	});
});
