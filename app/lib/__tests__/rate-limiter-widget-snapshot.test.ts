import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "../rate-limiter.server";

describe("RATE_LIMITS widget_snapshot", () => {
	it("caps home widget refreshes per minute", () => {
		expect(RATE_LIMITS.widget_snapshot.maxRequests).toBe(30);
		expect(RATE_LIMITS.widget_snapshot.windowMs).toBe(60_000);
		expect(RATE_LIMITS.widget_snapshot.keyPrefix).toBe("rate:widget_snapshot");
	});
});
