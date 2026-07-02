import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const invalidateTierCache = vi.fn();
const findFirstMember = vi.fn();
const dbBatch = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/capacity.server", () => ({
	invalidateTierCache: (...args: unknown[]) => invalidateTierCache(...args),
	CapacityExceededError: class CapacityExceededError extends Error {},
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: { findFirst: (...a: unknown[]) => findFirstMember(...a) },
		},
		batch: (...a: unknown[]) => dbBatch(...a),
		update: () => ({
			set: () => ({ where: () => ({}) }),
		}),
	}),
}));

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const actorMemberId = "11111111-1111-4111-8111-111111111111";
const newOwnerMemberId = "22222222-2222-4222-8222-222222222222";

function postRequest() {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/groups/ownership/transfer",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ newOwnerMemberId }),
		},
	);
}

describe("POST /api/mobile/v1/groups/ownership/transfer", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			invalidateTierCache,
			findFirstMember,
			dbBatch,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		findFirstMember
			.mockResolvedValueOnce({
				id: actorMemberId,
				role: "owner",
				userId: "user_1",
			})
			.mockResolvedValueOnce({
				id: newOwnerMemberId,
				role: "admin",
				userId: "user_2",
			});
		dbBatch.mockResolvedValue(undefined);
		invalidateTierCache.mockResolvedValue(undefined);
	});

	it("transfers ownership when actor is owner", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.ownership.transfer"
		);
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { success: boolean };

		expect(result.success).toBe(true);
		expect(dbBatch).toHaveBeenCalled();
		expect(invalidateTierCache).toHaveBeenCalledWith(env, "org_1");
	});

	it("rejects non-owners with 403", async () => {
		findFirstMember.mockReset();
		findFirstMember
			.mockResolvedValueOnce({
				id: actorMemberId,
				role: "admin",
				userId: "user_1",
			})
			.mockResolvedValueOnce({
				id: newOwnerMemberId,
				role: "member",
				userId: "user_2",
			});
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.ownership.transfer"
		);
		await expect(
			action({
				request: postRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("rejects when rate limited with 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false });
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.ownership.transfer"
		);
		await expect(
			action({
				request: postRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(dbBatch).not.toHaveBeenCalled();
	});
});
