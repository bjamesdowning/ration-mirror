import { describe, expect, it, vi } from "vitest";
import {
	lastActiveBillingOrgKey,
	recordLastActiveBillingOrg,
	revenueCatFulfillmentKey,
	stripeFulfillmentKey,
} from "~/lib/billing-idempotency.server";
import { createMockKV } from "~/test/helpers/mock-env";

describe("billing idempotency keys", () => {
	it("uses revenuecat-prefixed fulfillment keys as canonical source", () => {
		expect(revenueCatFulfillmentKey("evt_abc")).toBe("rc:evt_abc");
	});

	it("uses stripe-prefixed fulfillment keys during Stripe-direct rollout", () => {
		expect(stripeFulfillmentKey("evt_stripe")).toBe("stripe:evt_stripe");
	});

	it("records last active billing org under a stable KV key", async () => {
		const kv = createMockKV();
		await recordLastActiveBillingOrg(kv, "user_1", "org_9");
		expect(lastActiveBillingOrgKey("user_1")).toBe(
			"billing:lastActiveOrg:user_1",
		);
		expect(kv.put).toHaveBeenCalledWith(
			"billing:lastActiveOrg:user_1",
			"org_9",
			expect.objectContaining({ expirationTtl: expect.any(Number) }),
		);
		expect(vi.mocked(kv.put).mock.calls[0]?.[2]?.expirationTtl).toBeGreaterThan(
			0,
		);
	});
});
