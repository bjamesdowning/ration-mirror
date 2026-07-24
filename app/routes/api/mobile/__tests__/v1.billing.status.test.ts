import { beforeEach, describe, expect, it, vi } from "vitest";
import { TIER_LIMITS } from "~/lib/tiers";
import { createMockEnv } from "~/test/helpers/mock-env";

const requireMobileActiveGroup = vi.fn();
const checkBalance = vi.fn();
const getGroupTierLimits = vi.fn();
const getBillingStatusForUser = vi.fn();
const userFindFirst = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/ledger.server", () => ({
	checkBalance: (...args: unknown[]) => checkBalance(...args),
}));

vi.mock("~/lib/capacity.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/capacity.server")>();
	return {
		...actual,
		getGroupTierLimits: (...args: unknown[]) => getGroupTierLimits(...args),
	};
});

vi.mock("~/lib/billing.server", () => ({
	getBillingStatusForUser: (...args: unknown[]) =>
		getBillingStatusForUser(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		query: {
			user: { findFirst: userFindFirst },
		},
	})),
}));

const ctx = {
	cloudflare: { env: createMockEnv() },
} as never;

function getRequest() {
	return new Request("https://ration.mayutic.com/api/mobile/v1/billing/status");
}

describe("GET /api/mobile/v1/billing/status", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkBalance,
			getGroupTierLimits,
			getBillingStatusForUser,
			userFindFirst,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_free",
			organizationId: "org_crew",
		});
		checkBalance.mockResolvedValue(12);
		getGroupTierLimits.mockResolvedValue({
			tier: "crew_member",
			limits: TIER_LIMITS.crew_member,
			isExpired: false,
		});
		userFindFirst.mockResolvedValue({
			tier: "free",
			tierExpiresAt: null,
		});
		getBillingStatusForUser.mockResolvedValue({
			tier: "free",
			entitlements: {
				crew_member: {
					active: false,
					expiresAt: null,
					store: null,
				},
			},
			management: { store: null, url: null },
			canPurchaseSubscription: true,
			purchaseBlockReason: null,
			billingUnavailable: false,
		});
	});

	it("passes personal account tier (not org owner tier) into billing status", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.billing.status");
		const result = await loader({
			request: getRequest(),
			context: ctx,
			params: {},
		} as never);

		expect(getBillingStatusForUser).toHaveBeenCalledWith(
			expect.anything(),
			"user_free",
			"free",
		);
		expect(result).toMatchObject({
			tier: "free",
			accountTier: "free",
			accountTierExpired: false,
			organizationTier: "crew_member",
			organizationTierExpired: false,
			entitlements: { crew_member: { active: false } },
			canPurchaseSubscription: true,
			credits: 12,
		});
	});

	it("reports personal crew when the account owns Crew", async () => {
		userFindFirst.mockResolvedValue({
			tier: "crew_member",
			tierExpiresAt: null,
		});
		getBillingStatusForUser.mockResolvedValue({
			tier: "crew_member",
			entitlements: {
				crew_member: {
					active: true,
					expiresAt: "2099-01-01T00:00:00Z",
					store: "app_store",
				},
			},
			management: {
				store: "app_store",
				url: "https://apps.apple.com/account/subscriptions",
			},
			canPurchaseSubscription: false,
			purchaseBlockReason: "App Store",
			billingUnavailable: false,
		});

		const { loader } = await import("~/routes/api/mobile/v1.billing.status");
		const result = await loader({
			request: getRequest(),
			context: ctx,
			params: {},
		} as never);

		expect(getBillingStatusForUser).toHaveBeenCalledWith(
			expect.anything(),
			"user_free",
			"crew_member",
		);
		expect(result).toMatchObject({
			accountTier: "crew_member",
			organizationTier: "crew_member",
			entitlements: { crew_member: { active: true } },
		});
	});
});
