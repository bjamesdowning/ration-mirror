import { describe, expect, it, vi } from "vitest";
import {
	RC_ENTITLEMENT_CREW_MEMBER,
	RC_PRODUCT_CREDITS,
} from "~/lib/billing.constants";
import { BILLING_ERROR_CODES } from "~/lib/billing.errors";
import {
	assertCanPurchaseStripeSubscription,
	processRevenueCatWebhookEvent,
} from "~/lib/billing.server";
import { createMockEnv } from "~/test/helpers/mock-env";

describe("processRevenueCatWebhookEvent", () => {
	it("acknowledges valid events without fulfilling when flag is off", async () => {
		const env = createMockEnv();
		const result = await processRevenueCatWebhookEvent(env, {
			event: {
				type: "INITIAL_PURCHASE",
				id: "evt_1",
				app_user_id: "user_1",
				entitlement_ids: [RC_ENTITLEMENT_CREW_MEMBER],
				product_id: "crew_monthly",
				expiration_at_ms: Date.now() + 86_400_000,
			},
		});
		expect(result).toEqual({ handled: true, fulfilled: false });
	});

	it("rejects invalid payloads", async () => {
		const env = createMockEnv();
		const result = await processRevenueCatWebhookEvent(env, { bad: true });
		expect(result).toEqual({ handled: false, fulfilled: false });
	});
});

describe("assertCanPurchaseStripeSubscription", () => {
	it("blocks Stripe checkout when active App Store entitlement exists", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				subscriber: {
					entitlements: {
						[RC_ENTITLEMENT_CREW_MEMBER]: {
							identifier: RC_ENTITLEMENT_CREW_MEMBER,
							is_active: true,
							expires_date: "2099-01-01T00:00:00Z",
							product_identifier: "crew_monthly",
							store: "app_store",
						},
					},
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const { assertCanPurchaseStripeSubscription } = await import(
			"~/lib/billing.server"
		);
		const result = await assertCanPurchaseStripeSubscription(env, "user_1");
		expect(result.allowed).toBe(false);
		if (!result.allowed) {
			expect(result.reason).toContain("App Store");
		}

		vi.unstubAllGlobals();
	});

	it("fails closed when RevenueCat API is unreachable", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";

		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await assertCanPurchaseStripeSubscription(env, "user_1");
		expect(result.allowed).toBe(false);
		if (!result.allowed) {
			expect(result.code).toBe(BILLING_ERROR_CODES.BILLING_UNAVAILABLE);
		}

		vi.unstubAllGlobals();
	});
});

describe("RC_PRODUCT_CREDITS", () => {
	it("maps credit pack product IDs to positive amounts", () => {
		for (const amount of Object.values(RC_PRODUCT_CREDITS)) {
			expect(amount).toBeGreaterThan(0);
		}
	});
});
