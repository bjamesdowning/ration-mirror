import { beforeEach, describe, expect, it, vi } from "vitest";

const requireActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const removeGroupMember = vi.fn();

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
		removeGroupMember: (...args: unknown[]) => removeGroupMember(...args),
	};
});

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const memberId = "member_target_1";

function deleteRequest() {
	return new Request(
		`https://ration.mayutic.com/api/groups/members/${memberId}`,
		{ method: "DELETE" },
	);
}

describe("DELETE /api/groups/members/:memberId", () => {
	beforeEach(() => {
		for (const m of [requireActiveGroup, checkRateLimit, removeGroupMember]) {
			m.mockReset();
		}
		requireActiveGroup.mockResolvedValue({
			session: { user: { id: "user_1" } },
			groupId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		removeGroupMember.mockResolvedValue({
			removedUserId: "user_2",
			memberId,
		});
	});

	it("removes a member when owner is authorized", async () => {
		const { action } = await import("~/routes/api/groups.members.$memberId");
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

	it("returns GroupMembershipError via handleApiError", async () => {
		const { GroupMembershipError } = await import(
			"~/lib/group-membership.server"
		);
		removeGroupMember.mockRejectedValue(
			new GroupMembershipError(
				"Only the group owner can remove members",
				"forbidden",
				403,
			),
		);
		const { action } = await import("~/routes/api/groups.members.$memberId");
		const result = await action({
			request: deleteRequest(),
			context: ctx,
			params: { memberId },
		} as never);
		expect(result).toMatchObject({
			data: {
				error: "Only the group owner can remove members",
				code: "forbidden",
			},
			init: { status: 403 },
		});
	});
});
