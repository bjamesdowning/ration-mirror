import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBillingOrganizationId } from "~/lib/billing-tier.server";
import { createMockEnv, createMockKV } from "~/test/helpers/mock-env";

const mockMemberFindFirst = vi.fn();
const mockSessionFindFirst = vi.fn();
const mockHasOrgMembership = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		query: {
			member: { findFirst: mockMemberFindFirst },
			session: { findFirst: mockSessionFindFirst },
		},
	})),
}));

vi.mock("~/lib/org-membership.server", () => ({
	hasOrgMembership: (...args: unknown[]) => mockHasOrgMembership(...args),
}));

describe("resolveBillingOrganizationId", () => {
	beforeEach(() => {
		mockMemberFindFirst.mockReset();
		mockSessionFindFirst.mockReset();
		mockHasOrgMembership.mockReset();
		mockHasOrgMembership.mockResolvedValue(true);
		mockSessionFindFirst.mockResolvedValue(null);
		mockMemberFindFirst.mockResolvedValue(null);
	});

	it("prefers a valid subscriber-attribute organization", async () => {
		const env = createMockEnv();
		const result = await resolveBillingOrganizationId(env, "user_1", {
			preferredOrganizationId: "org_attr",
		});
		expect(result).toBe("org_attr");
		expect(mockHasOrgMembership).toHaveBeenCalledWith(
			env.DB,
			"user_1",
			"org_attr",
		);
		expect(mockSessionFindFirst).not.toHaveBeenCalled();
	});

	it("rejects a preferred org the user is not a member of and falls through to KV", async () => {
		const env = createMockEnv();
		const kv = createMockKV();
		(kv.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("org_kv");
		env.RATION_KV = kv;

		mockHasOrgMembership
			.mockResolvedValueOnce(false) // preferred
			.mockResolvedValueOnce(true); // kv

		const result = await resolveBillingOrganizationId(env, "user_1", {
			preferredOrganizationId: "org_attr",
		});
		expect(result).toBe("org_kv");
		expect(kv.get).toHaveBeenCalledWith("billing:lastActiveOrg:user_1");
	});

	it("uses the most recent web session active org when KV is empty", async () => {
		const env = createMockEnv();
		mockSessionFindFirst.mockResolvedValue({
			activeOrganizationId: "org_session",
		});
		mockHasOrgMembership.mockResolvedValue(true);

		const result = await resolveBillingOrganizationId(env, "user_1");
		expect(result).toBe("org_session");
	});

	it("falls back to first owner membership", async () => {
		const env = createMockEnv();
		mockMemberFindFirst
			.mockResolvedValueOnce({ organizationId: "org_owner" }) // owner
			.mockResolvedValueOnce(null); // unused any

		const result = await resolveBillingOrganizationId(env, "user_1");
		expect(result).toBe("org_owner");
	});

	it("falls back to any membership when user is not an owner", async () => {
		const env = createMockEnv();
		mockMemberFindFirst
			.mockResolvedValueOnce(null) // owner
			.mockResolvedValueOnce({ organizationId: "org_member" }); // any

		const result = await resolveBillingOrganizationId(env, "user_1");
		expect(result).toBe("org_member");
	});

	it("returns null when the user has no memberships", async () => {
		const env = createMockEnv();
		mockMemberFindFirst.mockResolvedValue(null);

		const result = await resolveBillingOrganizationId(env, "user_1");
		expect(result).toBeNull();
	});
});
