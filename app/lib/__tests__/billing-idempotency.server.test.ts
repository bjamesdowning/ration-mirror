import { describe, expect, it } from "vitest";
import {
	revenueCatFulfillmentKey,
	stripeFulfillmentKey,
} from "~/lib/billing-idempotency.server";

describe("billing idempotency keys", () => {
	it("uses revenuecat-prefixed fulfillment keys as canonical source", () => {
		expect(revenueCatFulfillmentKey("evt_abc")).toBe("rc:evt_abc");
	});

	it("uses stripe-prefixed fulfillment keys during Stripe-direct rollout", () => {
		expect(stripeFulfillmentKey("evt_stripe")).toBe("stripe:evt_stripe");
	});
});
