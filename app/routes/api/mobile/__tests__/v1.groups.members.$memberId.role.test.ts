import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const findFirstMember = vi.fn();
const dbUpdateSet = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: { findFirst: (...a: unknown[]) => findFirstMember(...a) },
		},
		update: () => ({
			set: (values: unknown) => ({
				where: () => dbUpdateSet(values),
			}),
		}),
	}),
}));

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const memberId = "22222222-2222-4222-8222-222222222222";

function patchRequest(role: "admin" | "member") {
	return new Request(
		`https://ration.mayutic.com/api/mobile/v1/groups/members/${memberId}/role`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role }),
		},
	);
}

describe("PATCH /api/mobile/v1/groups/members/:memberId/role", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			findFirstMember,
			dbUpdateSet,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		findFirstMember
			.mockResolvedValueOnce({ role: "owner" })
			.mockResolvedValueOnce({ id: memberId, role: "member" });
		dbUpdateSet.mockResolvedValue(undefined);
	});

	it("updates a member role when actor is owner", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.members.$memberId.role"
		);
		const result = (await action({
			request: patchRequest("admin"),
			context: ctx,
			params: { memberId },
		} as never)) as { success: boolean; role: string };

		expect(result.success).toBe(true);
		expect(result.role).toBe("admin");
		expect(dbUpdateSet).toHaveBeenCalledWith({ role: "admin" });
	});

	it("rejects actors without owner/admin role with 403", async () => {
		findFirstMember.mockReset();
		findFirstMember
			.mockResolvedValueOnce({ role: "member" })
			.mockResolvedValueOnce({ id: memberId, role: "member" });
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.members.$memberId.role"
		);
		await expect(
			action({
				request: patchRequest("admin"),
				context: ctx,
				params: { memberId },
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
		expect(dbUpdateSet).not.toHaveBeenCalled();
	});

	it("rejects when rate limited with 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false });
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.members.$memberId.role"
		);
		await expect(
			action({
				request: patchRequest("admin"),
				context: ctx,
				params: { memberId },
			} as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(dbUpdateSet).not.toHaveBeenCalled();
	});
});
