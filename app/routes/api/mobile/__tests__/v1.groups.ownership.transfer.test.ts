import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const assertCanOwnAnotherGroup = vi.fn();
const invalidateTierCache = vi.fn();
const findFirstMember = vi.fn();
const dbBatch = vi.fn();

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

vi.mock("~/lib/capacity.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/capacity.server")>();
	return {
		...actual,
		assertCanOwnAnotherGroup: (...args: unknown[]) =>
			assertCanOwnAnotherGroup(...args),
		invalidateTierCache: (...args: unknown[]) => invalidateTierCache(...args),
	};
});

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
			assertCanOwnAnotherGroup,
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
		assertCanOwnAnotherGroup.mockResolvedValue({
			allowed: true,
			current: 2,
			limit: 5,
			tier: "crew_member",
			canCreate: 3,
		});
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

	it("returns 403 when actor is not owner", async () => {
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
		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);
		expect(result).toMatchObject({
			init: { status: 403 },
			data: { error: "Only the group owner can transfer ownership" },
		});
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

	it("returns 403 when recipient is at owned-group capacity", async () => {
		assertCanOwnAnotherGroup.mockResolvedValue({
			allowed: false,
			current: 5,
			limit: 5,
			tier: "crew_member",
			canCreate: 0,
		});
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.ownership.transfer"
		);
		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);
		expect(result).toMatchObject({
			init: { status: 403 },
			data: {
				error: "recipient_capacity_exceeded",
				limit: 5,
				current: 5,
				message:
					"This member already owns the maximum number of groups (5) and cannot take ownership of another.",
			},
		});
		expect(assertCanOwnAnotherGroup).toHaveBeenCalledWith(env, "user_2");
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("returns free-tier Crew guidance when recipient cannot own another group", async () => {
		assertCanOwnAnotherGroup.mockResolvedValue({
			allowed: false,
			current: 1,
			limit: 1,
			tier: "free",
			canCreate: 0,
		});
		const { action } = await import(
			"~/routes/api/mobile/v1.groups.ownership.transfer"
		);
		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);
		expect(result).toMatchObject({
			init: { status: 403 },
			data: {
				error: "recipient_capacity_exceeded",
				tier: "free",
				message:
					"This member is on the free plan and can only own 1 group. They need Crew to take ownership of another.",
			},
		});
		expect(dbBatch).not.toHaveBeenCalled();
	});
});
