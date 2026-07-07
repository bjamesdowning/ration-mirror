import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getGroupTierLimits = vi.fn();
const findFirstMember = vi.fn();
const invitationSelect = vi.fn();
const invitationInsert = vi.fn();

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

vi.mock("~/lib/capacity.server", () => ({
	getGroupTierLimits: (...args: unknown[]) => getGroupTierLimits(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: { findFirst: (...a: unknown[]) => findFirstMember(...a) },
		},
		select: () => ({
			from: () => ({
				where: (...a: unknown[]) => invitationSelect(...a),
			}),
		}),
		insert: () => ({
			values: () => ({
				returning: () => invitationInsert(),
			}),
		}),
	}),
}));

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;

function postRequest() {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/groups/invitations/create",
		{ method: "POST" },
	);
}

describe("POST /api/mobile/v1/groups/invitations/create", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			getGroupTierLimits,
			findFirstMember,
			invitationSelect,
			invitationInsert,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		findFirstMember.mockResolvedValue({ role: "owner" });
		getGroupTierLimits.mockResolvedValue({
			tier: "crew_member",
			limits: { canInviteMembers: true },
		});
		invitationSelect.mockResolvedValue([]);
		invitationInsert.mockResolvedValue([
			{
				id: "inv_1",
				expiresAt: new Date("2026-07-10T00:00:00.000Z"),
			},
		]);
	});

	it("creates an invitation for owner/admin on Crew tier", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.invitations.create"
		);
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { success: boolean; invitationId: string };

		expect(result.success).toBe(true);
		expect(result.invitationId).toBe("inv_1");
		expect(requireMobileActiveGroup).toHaveBeenCalled();
		expect(invitationInsert).toHaveBeenCalled();
	});

	it("rejects members without invite permission with 403", async () => {
		findFirstMember.mockResolvedValue({ role: "member" });
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.invitations.create"
		);
		await expect(
			action({
				request: postRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
		expect(invitationInsert).not.toHaveBeenCalled();
	});

	it("returns feature_gated 403 when group tier cannot invite", async () => {
		getGroupTierLimits.mockResolvedValue({
			tier: "free",
			limits: { canInviteMembers: false },
		});
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.invitations.create"
		);
		await expect(
			action({
				request: postRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
		expect(invitationInsert).not.toHaveBeenCalled();
	});

	it("rejects when rate limited with 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.invitations.create"
		);
		await expect(
			action({
				request: postRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(invitationInsert).not.toHaveBeenCalled();
	});
});
