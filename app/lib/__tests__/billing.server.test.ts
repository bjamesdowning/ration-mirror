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

describe("processRevenueCatWebhookEvent", () => {
	beforeEach(() => {
		mockUserFindFirst.mockReset();
		mockUserUpdate.mockReset();
		mockUserUpdate.mockResolvedValue(undefined);
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
});
