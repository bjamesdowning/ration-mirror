import { describe, expect, it } from "vitest";
import { rateLimitResponse } from "../rate-limiter.server";

describe("rateLimitResponse", () => {
	it("returns 429 with dynamic Retry-After and rate limit headers", () => {
		const response = rateLimitResponse(
			{
				allowed: false,
				remaining: 0,
				resetAt: 1_700_000_000_000,
				retryAfter: 42,
			},
			"Slow down",
		);

		expect(response.init?.status).toBe(429);
		expect(response.data).toEqual({ error: "Slow down" });
		const headers = response.init?.headers as Record<string, string>;
		expect(headers["Retry-After"]).toBe("42");
		expect(headers["X-RateLimit-Remaining"]).toBe("0");
		expect(headers["X-RateLimit-Reset"]).toBe("1700000000000");
	});

	it("defaults Retry-After to 60 when retryAfter is missing", () => {
		const response = rateLimitResponse({
			allowed: false,
			remaining: 0,
			resetAt: 1_700_000_000_000,
		});

		const headers = response.init?.headers as Record<string, string>;
		expect(headers["Retry-After"]).toBe("60");
	});

	it("can include retry metadata in the response body", () => {
		const result = {
			allowed: false,
			remaining: 0,
			resetAt: 1_700_000_000_000,
			retryAfter: 15,
		};
		const response = rateLimitResponse(result, "Limited", {
			includeBodyMetadata: true,
		});

		expect(response.data).toEqual({
			error: "Limited",
			retryAfter: 15,
			resetAt: 1_700_000_000_000,
		});
	});
});
