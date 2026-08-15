import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	RC_ENTITLEMENT_CREW_MEMBER,
	RC_PRODUCT_CREDITS,
} from "~/lib/billing.constants";
import { BILLING_ERROR_CODES } from "~/lib/billing.errors";
import {
	assertCanPurchaseStripeSubscription,
	getBillingStatusForUser,
	processRevenueCatWebhookEvent,
	reconcileSubscriptionCancelAtPeriodEnd,
} from "~/lib/billing.server";
import { createMockEnv } from "~/test/helpers/mock-env";

const mockUserFindFirst = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		query: {
			user: { findFirst: mockUserFindFirst },
		},
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: mockUserUpdate,
			})),
		})),
	})),
}));

const mockResolveBillingOrganizationId = vi.fn();
const mockAddCredits = vi.fn();

vi.mock("~/lib/billing-tier.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/billing-tier.server")>();
	return {
		...actual,
		resolveBillingOrganizationId: (...args: unknown[]) =>
			mockResolveBillingOrganizationId(...args),
	};
});

vi.mock("~/lib/ledger.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/ledger.server")>();
	return {
		...actual,
		addCredits: (...args: unknown[]) => mockAddCredits(...args),
	};
});

describe("processRevenueCatWebhookEvent", () => {
	beforeEach(() => {
		mockUserFindFirst.mockReset();
		mockUserUpdate.mockReset();
		mockUserUpdate.mockResolvedValue(undefined);
		mockResolveBillingOrganizationId.mockReset();
		mockAddCredits.mockReset();
		mockResolveBillingOrganizationId.mockResolvedValue("org_1");
		mockAddCredits.mockResolvedValue(undefined);
	});

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

	it("warns and does not fulfill credit packs with unknown product ids", async () => {
		const env = createMockEnv();
		env.REVENUECAT_FULFILLMENT_ENABLED = "true";
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await processRevenueCatWebhookEvent(env, {
			event: {
				type: "NON_RENEWING_PURCHASE",
				id: "evt_unknown_product",
				app_user_id: "user_1",
				product_id: "not_a_real_pack",
			},
		});

		expect(result).toEqual({ handled: true, fulfilled: false });
		expect(mockAddCredits).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				level: "warn",
				msg: "RevenueCat credit pack not fulfilled",
			}),
		);
		warnSpy.mockRestore();
	});

	it("passes subscriber organization_id into org resolution", async () => {
		const env = createMockEnv();
		env.REVENUECAT_FULFILLMENT_ENABLED = "true";

		await processRevenueCatWebhookEvent(env, {
			event: {
				type: "NON_RENEWING_PURCHASE",
				id: "evt_with_attr",
				app_user_id: "user_1",
				product_id: "credits_s",
				subscriber_attributes: {
					organization_id: { value: "org_preferred" },
				},
			},
		});

		expect(mockResolveBillingOrganizationId).toHaveBeenCalledWith(
			env,
			"user_1",
			{ preferredOrganizationId: "org_preferred" },
		);
		expect(mockAddCredits).toHaveBeenCalled();
	});
});

describe("assertCanPurchaseStripeSubscription", () => {
	beforeEach(() => {
		mockUserFindFirst.mockReset();
		mockUserUpdate.mockReset();
		mockUserUpdate.mockResolvedValue(undefined);
	});

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

describe("reconcileSubscriptionCancelAtPeriodEnd", () => {
	beforeEach(() => {
		mockUserFindFirst.mockReset();
		mockUserUpdate.mockReset();
		mockUserUpdate.mockResolvedValue(undefined);
		mockUserFindFirst.mockResolvedValue({
			subscriptionCancelAtPeriodEnd: false,
			tierExpiresAt: null,
		});
	});

	it("sets D1 cancel flag when RC unsubscribe_detected_at is present", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					subscriber: {
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
								expires_date: "2026-07-28T00:00:00Z",
								unsubscribe_detected_at: "2026-07-20T12:00:00Z",
								store: "app_store",
							},
						},
					},
				}),
			}),
		);

		const result = await reconcileSubscriptionCancelAtPeriodEnd(env, "user_1");
		expect(result.cancelAtPeriodEnd).toBe(true);
		expect(mockUserUpdate).toHaveBeenCalled();

		vi.unstubAllGlobals();
	});

	it("leaves Stripe cancel flag alone when RC has no crew subscription row", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";
		mockUserFindFirst.mockResolvedValue({
			subscriptionCancelAtPeriodEnd: true,
			tierExpiresAt: null,
		});

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					subscriber: {
						entitlements: {},
						subscriptions: {},
					},
				}),
			}),
		);

		const result = await reconcileSubscriptionCancelAtPeriodEnd(env, "user_1");
		expect(result.cancelAtPeriodEnd).toBe(true);
		expect(mockUserUpdate).not.toHaveBeenCalled();

		vi.unstubAllGlobals();
	});
});

describe("getBillingStatusForUser", () => {
	beforeEach(() => {
		mockUserFindFirst.mockReset();
		mockUserUpdate.mockReset();
		mockUserUpdate.mockResolvedValue(undefined);
		mockUserFindFirst.mockResolvedValue({
			subscriptionCancelAtPeriodEnd: false,
			tierExpiresAt: null,
		});
	});

	it("treats free account tier as inactive even when RC has no crew entitlement", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				subscriber: {
					entitlements: {},
					subscriptions: {},
					management_url: null,
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const status = await getBillingStatusForUser(env, "user_1", "free");
		expect(status.tier).toBe("free");
		expect(status.entitlements.crew_member.active).toBe(false);
		expect(status.canPurchaseSubscription).toBe(true);
		expect(status.cancelAtPeriodEnd).toBe(false);

		vi.unstubAllGlobals();
	});

	it("marks crew active from personal account tier when RC entitlement is absent", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				subscriber: {
					entitlements: {},
					subscriptions: {},
					management_url: null,
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const status = await getBillingStatusForUser(env, "user_1", "crew_member");
		expect(status.tier).toBe("crew_member");
		expect(status.entitlements.crew_member.active).toBe(true);

		vi.unstubAllGlobals();
	});

	it("derives stripe store from stripeCustomerId when RC entitlement is absent", async () => {
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";
		mockUserFindFirst
			.mockResolvedValueOnce({
				subscriptionCancelAtPeriodEnd: false,
				tierExpiresAt: null,
			})
			.mockResolvedValueOnce({
				stripeCustomerId: "cus_web",
			});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				subscriber: {
					entitlements: {},
					subscriptions: {},
					management_url: null,
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const status = await getBillingStatusForUser(env, "user_1", "crew_member");
		expect(status.entitlements.crew_member.active).toBe(true);
		expect(status.management.store).toBe("stripe");
		expect(status.entitlements.crew_member.store).toBe("stripe");
		expect(status.canPurchaseSubscription).toBe(false);
		expect(status.purchaseBlockReason).toContain("web subscription");

		vi.unstubAllGlobals();
	});

	it("blocks App Store purchase for Stripe Crew even when RC API is not configured", async () => {
		const env = createMockEnv();
		delete (env as { REVENUECAT_API_KEY?: string }).REVENUECAT_API_KEY;
		mockUserFindFirst
			.mockResolvedValueOnce({
				subscriptionCancelAtPeriodEnd: false,
				tierExpiresAt: null,
			})
			.mockResolvedValueOnce({
				stripeCustomerId: "cus_web",
			});

		const status = await getBillingStatusForUser(env, "user_1", "crew_member");
		expect(status.management.store).toBe("stripe");
		expect(status.canPurchaseSubscription).toBe(false);
		expect(status.purchaseBlockReason).toContain("web subscription");
	});

	it("preserves app_store store and does not apply stripe fallback", async () => {
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
							management_url: "https://apps.apple.com/account/subscriptions",
						},
					},
					subscriptions: {},
					management_url: "https://apps.apple.com/account/subscriptions",
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const status = await getBillingStatusForUser(env, "user_1", "crew_member");
		expect(status.management.store).toBe("app_store");
		expect(status.entitlements.crew_member.store).toBe("app_store");
		// App Store Crew remains blocked from buying a second sub (existing guard).
		expect(status.canPurchaseSubscription).toBe(false);

		vi.unstubAllGlobals();
	});
});
