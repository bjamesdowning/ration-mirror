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

	it("parses RevenueCat dashboard TEST events with null optional fields", () => {
		const parsed = RevenueCatWebhookEventSchema.safeParse({
			api_version: "1.0",
			event: {
				type: "TEST",
				id: "848F7032-7F67-4FB8-8BE1-C9B4C0539C82",
				app_user_id: "8b80a9af-be48-489b-a09c-c7467173b1c8",
				entitlement_ids: null,
				entitlement_id: null,
				product_id: "test_product",
				expiration_at_ms: 1782736307311,
				store: "APP_STORE",
				currency: null,
				transaction_id: null,
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
