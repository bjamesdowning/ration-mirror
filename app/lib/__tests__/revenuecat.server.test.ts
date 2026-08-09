import { afterEach, describe, expect, it, vi } from "vitest";
import { RC_ENTITLEMENT_CREW_MEMBER } from "~/lib/billing.constants";
import {
	crewCancelAtPeriodEndFromSubscriber,
	crewExpiresAtFromSubscriber,
	isRevenueCatFulfillmentEnabled,
	setRevenueCatSubscriberAttributes,
	syncStripePurchaseBestEffort,
	verifyRevenueCatWebhookAuth,
} from "~/lib/revenuecat.server";
import { createMockEnv, createMockKV } from "~/test/helpers/mock-env";

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

describe("setRevenueCatSubscriberAttributes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("posts attributes with the secret API key", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);

		const ok = await setRevenueCatSubscriberAttributes(env, "user_1", {
			organization_id: "org_a",
		});
		expect(ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.revenuecat.com/v1/subscribers/user_1/attributes",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer sk_test_rc",
				}),
			}),
		);
		const body = JSON.parse(
			(fetchMock.mock.calls[0]?.[1] as { body: string }).body,
		);
		expect(body.attributes.organization_id.value).toBe("org_a");
	});
});

describe("syncStripePurchaseBestEffort", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("sets organization_id and records last-active org before receipt sync", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";
		env.REVENUECAT_STRIPE_PUBLIC_API_KEY = "strp_test";
		const kv = createMockKV();
		env.RATION_KV = kv;

		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);

		await syncStripePurchaseBestEffort(env, "user_1", "cs_test_123", {
			organizationId: "org_checkout",
		});

		expect(fetchMock.mock.calls[0]?.[0]).toContain("/attributes");
		expect(fetchMock.mock.calls[1]?.[0]).toContain("/receipts");
		expect(kv.put).toHaveBeenCalledWith(
			"billing:lastActiveOrg:user_1",
			"org_checkout",
			expect.any(Object),
		);
	});
});
