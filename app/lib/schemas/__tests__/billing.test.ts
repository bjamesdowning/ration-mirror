import { describe, expect, it } from "vitest";
import { RevenueCatWebhookEventSchema } from "~/lib/schemas/billing";
import { MobileBillingStatusSchema } from "~/lib/schemas/mobile/billing";

describe("RevenueCatWebhookEventSchema", () => {
	it("parses a minimal INITIAL_PURCHASE event", () => {
		const parsed = RevenueCatWebhookEventSchema.safeParse({
			event: {
				type: "INITIAL_PURCHASE",
				id: "evt_abc",
				app_user_id: "user_123",
				entitlement_ids: ["crew_member"],
				product_id: "crew_monthly",
			},
		});
		expect(parsed.success).toBe(true);
	});
});

describe("MobileBillingStatusSchema", () => {
	it("accepts billing status shape", () => {
		const parsed = MobileBillingStatusSchema.safeParse({
			tier: "crew_member",
			entitlements: {
				crew_member: {
					active: true,
					expiresAt: "2099-01-01T00:00:00Z",
					store: "stripe",
				},
			},
			management: { store: "stripe", url: "https://billing.stripe.com" },
			canPurchaseSubscription: false,
			purchaseBlockReason: null,
			billingUnavailable: false,
		});
		expect(parsed.success).toBe(true);
	});
});
