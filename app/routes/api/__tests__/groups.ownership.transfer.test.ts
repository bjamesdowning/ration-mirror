import { beforeEach, describe, expect, it, vi } from "vitest";

const requireActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const assertCanOwnAnotherGroup = vi.fn();
const invalidateTierCache = vi.fn();
const findFirstMember = vi.fn();
const dbBatch = vi.fn();

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
		"https://ration.mayutic.com/api/groups/ownership/transfer",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ newOwnerMemberId }),
		},
	);
}

describe("POST /api/groups/ownership/transfer", () => {
	beforeEach(() => {
		for (const m of [
			requireActiveGroup,
			checkRateLimit,
			assertCanOwnAnotherGroup,
			invalidateTierCache,
			findFirstMember,
			dbBatch,
		]) {
			m.mockReset();
		}
		requireActiveGroup.mockResolvedValue({
			session: { user: { id: "user_1" } },
			groupId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		assertCanOwnAnotherGroup.mockResolvedValue({
			allowed: true,
			current: 1,
			limit: 5,
			tier: "crew_member",
			canCreate: 4,
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

	it("returns 403 when recipient is at owned-group capacity", async () => {
		assertCanOwnAnotherGroup.mockResolvedValue({
			allowed: false,
			current: 5,
			limit: 5,
			tier: "crew_member",
			canCreate: 0,
		});
		const { action } = await import("~/routes/api/groups.ownership.transfer");
		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);
		expect(result).toMatchObject({
			data: {
				error: "recipient_capacity_exceeded",
				limit: 5,
				current: 5,
				message:
					"This member already owns the maximum number of groups (5) and cannot take ownership of another.",
			},
			init: { status: 403 },
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
		const { action } = await import("~/routes/api/groups.ownership.transfer");
		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);
		expect(result).toMatchObject({
			data: {
				error: "recipient_capacity_exceeded",
				tier: "free",
				limit: 1,
				message:
					"This member is on the free plan and can only own 1 group. They need Crew to take ownership of another.",
			},
			init: { status: 403 },
		});
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("accepts Better Auth alphanumeric member IDs", async () => {
		const betterAuthId = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
		findFirstMember.mockReset();
		findFirstMember
			.mockResolvedValueOnce({
				id: actorMemberId,
				role: "owner",
				userId: "user_1",
			})
			.mockResolvedValueOnce({
				id: betterAuthId,
				role: "member",
				userId: "user_2",
			});
		const { action } = await import("~/routes/api/groups.ownership.transfer");
		const request = new Request(
			"https://ration.mayutic.com/api/groups/ownership/transfer",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newOwnerMemberId: betterAuthId }),
			},
		);
		const result = await action({
			request,
			context: ctx,
			params: {},
		} as never);
		expect(result).toMatchObject({ success: true });
		expect(dbBatch).toHaveBeenCalled();
	});
});
