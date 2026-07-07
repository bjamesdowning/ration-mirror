import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "../rate-limiter.server";

describe("RATE_LIMITS api_key_create", () => {
	it("is restrictive for credential minting", () => {
		expect(RATE_LIMITS.api_key_create.maxRequests).toBe(5);
		expect(RATE_LIMITS.api_key_create.keyPrefix).toBe("rate:api_key_create");
		expect(RATE_LIMITS.api_key_create.windowMs).toBe(60_000);
	});
});
