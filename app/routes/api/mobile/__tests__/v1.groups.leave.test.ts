import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const listMobileOrganizations = vi.fn();
const checkRateLimit = vi.fn();
const leaveGroup = vi.fn();

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

vi.mock("~/lib/group-membership.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/group-membership.server")>();
	return {
		...actual,
		leaveGroup: (...args: unknown[]) => leaveGroup(...args),
	};
});

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;

function postRequest() {
	return new Request("https://ration.mayutic.com/api/mobile/v1/groups/leave", {
		method: "POST",
	});
}

describe("POST /api/mobile/v1/groups/leave", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			listMobileOrganizations,
			checkRateLimit,
			leaveGroup,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		leaveGroup.mockResolvedValue({ organizationId: "org_1" });
		listMobileOrganizations.mockResolvedValue([
			{ id: "org_personal", name: "Personal", role: "owner", credits: 0 },
		]);
	});

	it("leaves and returns remaining organizations", async () => {
		const { action } = await import("~/routes/api/mobile/v1.groups.leave");
		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);
		expect(result).toEqual({
			success: true,
			organizations: [
				{ id: "org_personal", name: "Personal", role: "owner", credits: 0 },
			],
		});
		expect(leaveGroup).toHaveBeenCalledWith({
			env,
			organizationId: "org_1",
			userId: "user_1",
		});
		expect(listMobileOrganizations).toHaveBeenCalledWith(env, "user_1", null);
	});
});
