import { describe, expect, it } from "vitest";
import { RC_ENTITLEMENT_CREW_MEMBER } from "~/lib/billing.constants";
import {
	crewCancelAtPeriodEndFromSubscriber,
	crewExpiresAtFromSubscriber,
	isRevenueCatFulfillmentEnabled,
	verifyRevenueCatWebhookAuth,
} from "~/lib/revenuecat.server";
import { createMockEnv } from "~/test/helpers/mock-env";

describe("verifyRevenueCatWebhookAuth", () => {
	it("accepts matching bearer token", () => {
		const env = createMockEnv();
		env.REVENUECAT_WEBHOOK_SECRET = "whsec_rc_test";
		const request = new Request("https://example.com/webhook", {
			headers: { Authorization: "Bearer whsec_rc_test" },
		});
		expect(verifyRevenueCatWebhookAuth(request, env)).toBe(true);
	});

	it("rejects missing or wrong token", () => {
		const env = createMockEnv();
		env.REVENUECAT_WEBHOOK_SECRET = "whsec_rc_test";
		const request = new Request("https://example.com/webhook");
		expect(verifyRevenueCatWebhookAuth(request, env)).toBe(false);
	});
});

describe("isRevenueCatFulfillmentEnabled", () => {
	it("defaults to false", () => {
		const env = createMockEnv();
		expect(isRevenueCatFulfillmentEnabled(env)).toBe(false);
	});

	it("is true only when env var is the string true", () => {
		const env = createMockEnv();
		env.REVENUECAT_FULFILLMENT_ENABLED = "true";
		expect(isRevenueCatFulfillmentEnabled(env)).toBe(true);
	});
});

describe("crewCancelAtPeriodEndFromSubscriber", () => {
	it("is true when unsubscribe_detected_at is set on the Crew product", () => {
		expect(
			crewCancelAtPeriodEndFromSubscriber({
				entitlements: {
					[RC_ENTITLEMENT_CREW_MEMBER]: {
						identifier: RC_ENTITLEMENT_CREW_MEMBER,
						is_active: true,
						expires_date: "2026-07-28T00:00:00Z",
						product_identifier: "crew_monthly",
						store: "app_store",
					},
				},
				subscriptions: {
					crew_monthly: {
						unsubscribe_detected_at: "2026-07-20T00:00:00Z",
					},
				},
			}),
		).toBe(true);
	});

	it("is false when still renewing", () => {
		expect(
			crewCancelAtPeriodEndFromSubscriber({
				entitlements: {
					[RC_ENTITLEMENT_CREW_MEMBER]: {
						identifier: RC_ENTITLEMENT_CREW_MEMBER,
						is_active: true,
						expires_date: "2026-07-28T00:00:00Z",
						product_identifier: "crew_monthly",
					},
				},
				subscriptions: {
					crew_monthly: {
						unsubscribe_detected_at: null,
					},
				},
			}),
		).toBe(false);
	});
});

describe("crewExpiresAtFromSubscriber", () => {
	it("returns entitlement expires_date", () => {
		expect(
			crewExpiresAtFromSubscriber({
				entitlements: {
					[RC_ENTITLEMENT_CREW_MEMBER]: {
						identifier: RC_ENTITLEMENT_CREW_MEMBER,
						is_active: true,
						expires_date: "2026-07-28T00:00:00Z",
						product_identifier: "crew_monthly",
					},
				},
				subscriptions: {},
			}),
		).toBe("2026-07-28T00:00:00Z");
	});
});
