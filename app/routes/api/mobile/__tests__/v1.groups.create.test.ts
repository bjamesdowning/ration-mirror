import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileUserAuth = vi.fn();
const checkRateLimit = vi.fn();
const checkOwnedGroupCapacity = vi.fn();
const dbBatch = vi.fn();
const organizationFindFirst = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileUserAuth: (...args: unknown[]) => requireMobileUserAuth(...args),
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
	checkOwnedGroupCapacity: (...args: unknown[]) =>
		checkOwnedGroupCapacity(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			organization: {
				findFirst: (...args: unknown[]) => organizationFindFirst(...args),
			},
		},
		batch: (...args: unknown[]) => dbBatch(...args),
		insert: () => ({
			values: () => ({}),
		}),
	}),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function postRequest(body: Record<string, unknown>) {
	return new Request("https://ration.mayutic.com/api/mobile/v1/groups", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/mobile/v1/groups", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileUserAuth,
			checkRateLimit,
			checkOwnedGroupCapacity,
			dbBatch,
			organizationFindFirst,
		]) {
			m.mockReset();
		}
		requireMobileUserAuth.mockResolvedValue({ userId: "user_1" });
		checkRateLimit.mockResolvedValue({ allowed: true });
		checkOwnedGroupCapacity.mockResolvedValue({
			allowed: true,
			current: 0,
			limit: 3,
			tier: "free",
			canCreate: true,
		});
		organizationFindFirst.mockResolvedValue(undefined);
		dbBatch.mockResolvedValue(undefined);
	});

	it("creates a group and returns organizationId on success", async () => {
		const { action } = await import("~/routes/api/mobile/v1.groups");
		const result = (await action({
			request: postRequest({ name: "Station Alpha", slug: "station-alpha" }),
			context: ctx,
			params: {},
		} as never)) as { success: boolean; organizationId: string };

		expect(result.success).toBe(true);
		expect(result.organizationId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
		expect(requireMobileUserAuth).toHaveBeenCalled();
		expect(checkRateLimit).toHaveBeenCalledWith({}, "group_create", "user_1");
		expect(checkOwnedGroupCapacity).toHaveBeenCalledWith(
			expect.objectContaining({ DB: {}, RATION_KV: {} }),
			"user_1",
		);
		expect(dbBatch).toHaveBeenCalled();
	});

	it("rejects invalid slug with 400", async () => {
		const { action } = await import("~/routes/api/mobile/v1.groups");
		const result = (await action({
			request: postRequest({ name: "Bad Slug", slug: "Invalid Slug!" }),
			context: ctx,
			params: {},
		} as never)) as Response;

		expect(result).toMatchObject({ init: { status: 400 } });
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("rejects when rate limited with 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });
		const { action } = await import("~/routes/api/mobile/v1.groups");
		await expect(
			action({
				request: postRequest({ name: "Station Alpha", slug: "station-alpha" }),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("rejects when owned-group capacity is exceeded with 403", async () => {
		checkOwnedGroupCapacity.mockResolvedValue({
			allowed: false,
			current: 5,
			limit: 5,
			tier: "crew_member",
			canCreate: 0,
		});
		const { action } = await import("~/routes/api/mobile/v1.groups");
		await expect(
			action({
				request: postRequest({ name: "Station Alpha", slug: "station-alpha" }),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({
			init: { status: 403 },
			data: {
				error: "capacity_exceeded",
				resource: "owned_groups",
				limit: 5,
				current: 5,
			},
		});
		expect(dbBatch).not.toHaveBeenCalled();
	});
});
