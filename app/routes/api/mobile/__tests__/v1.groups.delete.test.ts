import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const listMobileOrganizations = vi.fn();
const checkRateLimit = vi.fn();
const findFirstMember = vi.fn();
const findFirstOrg = vi.fn();
const deleteOrganization = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
	listMobileOrganizations: (...args: unknown[]) =>
		listMobileOrganizations(...args),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

vi.mock("~/lib/organizations.server", () => ({
	deleteOrganization: (...args: unknown[]) => deleteOrganization(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: { findFirst: (...a: unknown[]) => findFirstMember(...a) },
			organization: { findFirst: (...a: unknown[]) => findFirstOrg(...a) },
		},
	}),
}));

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const orgId = "11111111-1111-4111-8111-111111111111";

function deleteRequest(
	body: Record<string, unknown> = { organizationId: orgId },
) {
	return new Request("https://ration.mayutic.com/api/mobile/v1/groups/delete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/mobile/v1/groups/delete", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			listMobileOrganizations,
			checkRateLimit,
			findFirstMember,
			findFirstOrg,
			deleteOrganization,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({ userId: "user_1" });
		listMobileOrganizations.mockResolvedValue([
			{
				id: "22222222-2222-4222-8222-222222222222",
				name: "Other Group",
				slug: "other-group",
				logo: null,
				credits: 0,
				role: "owner",
				isActive: false,
			},
		]);
		checkRateLimit.mockResolvedValue({ allowed: true });
		findFirstMember.mockResolvedValue({ role: "owner" });
		findFirstOrg.mockResolvedValue({ slug: "home-kitchen" });
		deleteOrganization.mockResolvedValue(undefined);
	});

	it("deletes a group when the caller is owner", async () => {
		const { action } = await import("~/routes/api/mobile/v1.groups.delete");
		const result = (await action({
			request: deleteRequest(),
			context: ctx,
			params: {},
		} as never)) as { success: boolean; organizations: unknown[] };

		expect(result.success).toBe(true);
		expect(result.organizations).toHaveLength(1);
		expect(listMobileOrganizations).toHaveBeenCalledWith(env, "user_1", null);
		expect(requireMobileActiveGroup).toHaveBeenCalled();
		expect(findFirstMember).toHaveBeenCalled();
		expect(deleteOrganization).toHaveBeenCalledWith(env, orgId);
	});

	it("rejects non-owners with 403", async () => {
		findFirstMember.mockResolvedValue({ role: "admin" });
		const { action } = await import("~/routes/api/mobile/v1.groups.delete");
		await expect(
			action({
				request: deleteRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
		expect(deleteOrganization).not.toHaveBeenCalled();
	});

	it("rejects when rate limited with 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false });
		const { action } = await import("~/routes/api/mobile/v1.groups.delete");
		await expect(
			action({
				request: deleteRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(deleteOrganization).not.toHaveBeenCalled();
	});
});
