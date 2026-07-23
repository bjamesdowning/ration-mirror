import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	BILLING_SUMMARY_DENYLIST_KEYS,
	BillingAccountSummarySchema,
} from "~/lib/schemas/billing";
import { TIER_LIMITS } from "~/lib/tiers";
import { createMockEnv } from "~/test/helpers/mock-env";

const mockUserFindFirst = vi.fn();
const mockOrgFindFirst = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		query: {
			user: { findFirst: mockUserFindFirst },
			organization: { findFirst: mockOrgFindFirst },
		},
	})),
}));

vi.mock("~/lib/capacity.server", () => ({
	getGroupTierLimits: vi.fn(),
	getEffectiveTier: vi.fn(
		(tier: "free" | "crew_member", _expires: unknown) => ({
			tier,
			isExpired: false,
		}),
	),
}));

vi.mock("~/lib/org-supply-settings.server", () => ({
	getMemberRole: vi.fn(),
}));

vi.mock("~/lib/ledger.server", () => ({
	checkBalance: vi.fn(),
}));

vi.mock("~/lib/copilot/gate.server", () => ({
	getCopilotStatus: vi.fn(),
}));

import { RC_ENTITLEMENT_CREW_MEMBER } from "~/lib/billing.constants";
import * as BillingServer from "~/lib/billing.server";
import { getGroupTierLimits } from "~/lib/capacity.server";
import { getCopilotStatus } from "~/lib/copilot/gate.server";
import { checkBalance } from "~/lib/ledger.server";
import { getMemberRole } from "~/lib/org-supply-settings.server";

const baseCopilotStatus = {
	tier: "free",
	freeConversationsRemaining: 0,
	allowanceResetAt: "2099-01-01T00:00:00.000Z",
	creditBalance: 12,
	autoDeductConsent: false,
	conversationFloorCost: 1,
	sessionIdleMs: 1_200_000,
	tokensPerCredit: 20_000,
	sessionMaxTokens: 500_000,
	onboardingBriefingEligible: false,
	onboardingBriefingConsumed: false,
};

describe("getBillingAccountSummary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getGroupTierLimits).mockResolvedValue({
			tier: "free",
			limits: TIER_LIMITS.free,
			isExpired: false,
		});
		vi.mocked(getMemberRole).mockResolvedValue("owner");
		vi.mocked(checkBalance).mockResolvedValue(42);
		vi.mocked(getCopilotStatus).mockResolvedValue(baseCopilotStatus);
		mockUserFindFirst.mockResolvedValue({
			tier: "free",
			tierExpiresAt: null,
			subscriptionCancelAtPeriodEnd: false,
			crewSubscribedAt: null,
			stripeCustomerId: null,
		});
		mockOrgFindFirst.mockResolvedValue({
			id: "org-1",
			name: "Orbital Pantry",
		});
	});

	it("returns a free-tier snapshot with org credits and action links", async () => {
		const env = createMockEnv();
		env.BETTER_AUTH_URL = "https://ration.mayutic.com";

		const summary = await BillingServer.getBillingAccountSummary(env, {
			userId: "user-1",
			organizationId: "org-1",
		});

		expect(summary.account.tier).toBe("free");
		expect(summary.organization.credits).toBe(42);
		expect(summary.organization.userRole).toBe("owner");
		expect(summary.organization.name).toBe("Orbital Pantry");
		expect(summary.actions.pricingUrl).toBe(
			"https://ration.mayutic.com/hub/pricing",
		);
		expect(summary.actions.settingsUrl).toBe(
			"https://ration.mayutic.com/hub/settings",
		);
		expect(summary.copilot.tokensPerCredit).toBe(20_000);
		expect(summary.copilot.sessionMaxTokens).toBe(500_000);
		expect(BillingAccountSummarySchema.safeParse(summary).success).toBe(true);
	});

	it("reflects crew member subscription with Stripe portal availability", async () => {
		const renewsAt = new Date("2099-06-01T00:00:00.000Z");
		const env = createMockEnv();
		env.REVENUECAT_API_KEY = "sk_test_rc";

		mockUserFindFirst.mockResolvedValue({
			tier: "crew_member",
			tierExpiresAt: renewsAt,
			subscriptionCancelAtPeriodEnd: true,
			crewSubscribedAt: new Date("2098-01-01T00:00:00.000Z"),
			stripeCustomerId: "cus_test",
		});
		vi.mocked(getGroupTierLimits).mockResolvedValue({
			tier: "crew_member",
			limits: TIER_LIMITS.crew_member,
			isExpired: false,
		});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				subscriber: {
					entitlements: {
						[RC_ENTITLEMENT_CREW_MEMBER]: {
							identifier: RC_ENTITLEMENT_CREW_MEMBER,
							is_active: true,
							expires_date: renewsAt.toISOString(),
							product_identifier: "crew_annual",
							store: "stripe",
							management_url: "https://billing.stripe.com/session/test",
						},
					},
					management_url: "https://billing.stripe.com/session/test",
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const summary = await BillingServer.getBillingAccountSummary(env, {
			userId: "user-1",
			organizationId: "org-1",
		});

		expect(summary.account.tier).toBe("crew_member");
		expect(summary.account.cancelAtPeriodEnd).toBe(true);
		expect(summary.account.renewsOrEndsAt).toBe(renewsAt.toISOString());
		expect(summary.subscription.active).toBe(true);
		expect(summary.subscription.store).toBe("stripe");
		expect(summary.actions.portalAvailable).toBe(true);

		vi.unstubAllGlobals();
	});

	it("surfaces App Store management URL and purchase block reason", async () => {
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
					management_url: "https://apps.apple.com/account/subscriptions",
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const summary = await BillingServer.getBillingAccountSummary(env, {
			userId: "user-1",
			organizationId: "org-1",
		});

		expect(summary.subscription.store).toBe("app_store");
		expect(summary.subscription.managementUrl).toContain("apple.com");
		expect(summary.subscription.canPurchaseOnWeb).toBe(false);
		expect(summary.subscription.purchaseBlockReason).toContain("App Store");

		vi.unstubAllGlobals();
	});

	it("omits denylisted billing identifiers from serialized output", async () => {
		const summary = await BillingServer.getBillingAccountSummary(
			createMockEnv(),
			{
				userId: "user-1",
				organizationId: "org-1",
			},
		);

		const serialized = JSON.stringify(summary).toLowerCase();
		for (const key of BILLING_SUMMARY_DENYLIST_KEYS) {
			expect(serialized).not.toContain(key.toLowerCase());
		}
		expect(serialized).not.toContain("cus_test");
	});

	it("throws when organization membership is missing", async () => {
		vi.mocked(getMemberRole).mockResolvedValueOnce(null);

		await expect(
			BillingServer.getBillingAccountSummary(createMockEnv(), {
				userId: "user-1",
				organizationId: "org-1",
			}),
		).rejects.toThrow("Organization membership not found");
	});
});
