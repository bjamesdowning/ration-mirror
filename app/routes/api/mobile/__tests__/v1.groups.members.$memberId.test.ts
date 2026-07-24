import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const removeGroupMember = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
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
		removeGroupMember: (...args: unknown[]) => removeGroupMember(...args),
	};
});

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const memberId = "member_target_1";

function deleteRequest() {
	return new Request(
		`https://ration.mayutic.com/api/mobile/v1/groups/members/${memberId}`,
		{ method: "DELETE" },
	);
}

describe("DELETE /api/mobile/v1/groups/members/:memberId", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			removeGroupMember,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		removeGroupMember.mockResolvedValue({
			removedUserId: "user_2",
			memberId,
		});
	});

	it("removes a member when owner is authorized", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.members.$memberId"
		);
		const result = await action({
			request: deleteRequest(),
			context: ctx,
			params: { memberId },
		} as never);
		expect(result).toEqual({ success: true, memberId });
		expect(removeGroupMember).toHaveBeenCalledWith({
			env,
			organizationId: "org_1",
			actorUserId: "user_1",
			targetMemberId: memberId,
		});
	});
});
