import { beforeEach, describe, expect, it, vi } from "vitest";

const requireActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const leaveGroup = vi.fn();

vi.mock("~/lib/auth.server", () => ({
	requireActiveGroup: (...args: unknown[]) => requireActiveGroup(...args),
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
	return new Request("https://ration.mayutic.com/api/groups/leave", {
		method: "POST",
	});
}

describe("POST /api/groups/leave", () => {
	beforeEach(() => {
		for (const m of [requireActiveGroup, checkRateLimit, leaveGroup]) {
			m.mockReset();
		}
		requireActiveGroup.mockResolvedValue({
			session: { user: { id: "user_1" } },
			groupId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		leaveGroup.mockResolvedValue({ organizationId: "org_1" });
	});

	it("leaves the active group", async () => {
		const { action } = await import("~/routes/api/groups.leave");
		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);
		expect(result).toEqual({ success: true });
		expect(leaveGroup).toHaveBeenCalledWith({
			env,
			organizationId: "org_1",
			userId: "user_1",
		});
	});

	it("returns owner_cannot_leave via handleApiError", async () => {
		const { GroupMembershipError } = await import(
			"~/lib/group-membership.server"
		);
		leaveGroup.mockRejectedValue(
			new GroupMembershipError(
				"Owners cannot leave a group. Transfer ownership or delete the group instead.",
				"owner_cannot_leave",
				403,
			),
		);
		const { action } = await import("~/routes/api/groups.leave");
		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);
		expect(result).toMatchObject({
			data: {
				code: "owner_cannot_leave",
			},
			init: { status: 403 },
		});
	});
});
