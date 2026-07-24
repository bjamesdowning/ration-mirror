import { beforeEach, describe, expect, it, vi } from "vitest";
import { TIER_LIMITS } from "~/lib/tiers";
import { createMockEnv } from "~/test/helpers/mock-env";

const requireMobileActiveGroup = vi.fn();
const getMobileUser = vi.fn();
const getOrganizationRecord = vi.fn();
const checkBalance = vi.fn();
const getGroupTierLimits = vi.fn();
const listMobileOrganizations = vi.fn();
const getClientSafeFlags = vi.fn();
const buildFlagContext = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
	getMobileUser: (...args: unknown[]) => getMobileUser(...args),
	listMobileOrganizations: (...args: unknown[]) =>
		listMobileOrganizations(...args),
}));

vi.mock("~/lib/mobile/dashboard.server", () => ({
	getOrganizationRecord: (...args: unknown[]) => getOrganizationRecord(...args),
}));

vi.mock("~/lib/ledger.server", () => ({
	checkBalance: (...args: unknown[]) => checkBalance(...args),
	AI_COSTS: { scan: 1, generate: 2 },
}));

vi.mock("~/lib/capacity.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/capacity.server")>();
	return {
		...actual,
		getGroupTierLimits: (...args: unknown[]) => getGroupTierLimits(...args),
	};
});

vi.mock("~/lib/feature-flags/flags.server", () => ({
	buildFlagContext: (...args: unknown[]) => buildFlagContext(...args),
	getClientSafeFlags: (...args: unknown[]) => getClientSafeFlags(...args),
}));

const ctx = {
	cloudflare: { env: createMockEnv() },
} as never;

function getRequest() {
	return new Request("https://ration.mayutic.com/api/mobile/v1/session");
}

describe("GET /api/mobile/v1/session", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			getMobileUser,
			getOrganizationRecord,
			checkBalance,
			getGroupTierLimits,
			listMobileOrganizations,
			getClientSafeFlags,
			buildFlagContext,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_free",
			organizationId: "org_crew",
		});
		getMobileUser.mockResolvedValue({
			id: "user_free",
			name: "Free Member",
			email: "free@example.com",
			image: null,
			settings: {},
			tier: "free",
			tierExpiresAt: null,
		});
		getOrganizationRecord.mockResolvedValue({
			id: "org_crew",
			name: "Crew Kitchen",
			slug: "crew-kitchen",
			logo: null,
			credits: 20,
		});
		checkBalance.mockResolvedValue(20);
		getGroupTierLimits.mockResolvedValue({
			tier: "crew_member",
			limits: TIER_LIMITS.crew_member,
			isExpired: false,
		});
		listMobileOrganizations.mockResolvedValue([]);
		buildFlagContext.mockReturnValue({});
		getClientSafeFlags.mockResolvedValue({});
	});

	it("returns organization tier for capacity and personal accountTier separately", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.session");
		const result = await loader({
			request: getRequest(),
			context: ctx,
			params: {},
		} as never);

		expect(result).toMatchObject({
			tier: "crew_member",
			isTierExpired: false,
			accountTier: "free",
			accountTierExpired: false,
			credits: 20,
			user: { id: "user_free", email: "free@example.com" },
		});
	});
});
