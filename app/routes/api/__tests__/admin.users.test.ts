import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const checkRateLimit = vi.fn();
const listAdminUsers = vi.fn();

vi.mock("~/lib/auth.server", () => ({
	requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

vi.mock("~/lib/admin-users.server", () => ({
	listAdminUsers: (...args: unknown[]) => listAdminUsers(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({}),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function getRequest(query = "") {
	return new Request(`https://ration.mayutic.com/api/admin/users${query}`);
}

const mockUsersResult = {
	users: [],
	total: 0,
	page: 1,
	limit: 25,
	totalPages: 0,
};

describe("GET /api/admin/users", () => {
	beforeEach(() => {
		for (const m of [requireAdmin, checkRateLimit, listAdminUsers]) {
			m.mockReset();
		}
		requireAdmin.mockResolvedValue({ id: "admin_1", isAdmin: true });
		checkRateLimit.mockResolvedValue({ allowed: true });
		listAdminUsers.mockResolvedValue(mockUsersResult);
	});

	it("uses admin_list for pagination without a search query", async () => {
		const { loader } = await import("~/routes/api/admin.users");
		const result = await loader({
			request: getRequest("?page=2&sort=createdAt"),
			context: ctx,
			params: {},
		} as never);

		expect(checkRateLimit).toHaveBeenCalledWith({}, "admin_list", "admin_1");
		expect(listAdminUsers).toHaveBeenCalled();
		expect(result).toEqual(mockUsersResult);
	});

	it("uses admin_search when q is present", async () => {
		const { loader } = await import("~/routes/api/admin.users");
		await loader({
			request: getRequest("?q=alice&page=1"),
			context: ctx,
			params: {},
		} as never);

		expect(checkRateLimit).toHaveBeenCalledWith({}, "admin_search", "admin_1");
		expect(listAdminUsers).toHaveBeenCalled();
	});

	it("returns 429 without throwing when list rate limit is exceeded", async () => {
		checkRateLimit.mockResolvedValue({
			allowed: false,
			retryAfter: 30,
			resetAt: 1_700_000_000_000,
		});

		const { loader } = await import("~/routes/api/admin.users");
		const result = (await loader({
			request: getRequest("?page=1"),
			context: ctx,
			params: {},
		} as never)) as {
			init?: { status: number };
			data: Record<string, unknown>;
		};

		expect(result.init?.status).toBe(429);
		expect(result.data).toMatchObject({
			error: "Too many list requests. Please try again later.",
			retryAfter: 30,
		});
		expect(listAdminUsers).not.toHaveBeenCalled();
	});

	it("returns 429 without throwing when search rate limit is exceeded", async () => {
		checkRateLimit.mockResolvedValue({
			allowed: false,
			retryAfter: 15,
			resetAt: 1_700_000_000_000,
		});

		const { loader } = await import("~/routes/api/admin.users");
		const result = (await loader({
			request: getRequest("?q=bob"),
			context: ctx,
			params: {},
		} as never)) as {
			init?: { status: number };
			data: Record<string, unknown>;
		};

		expect(checkRateLimit).toHaveBeenCalledWith({}, "admin_search", "admin_1");
		expect(result.init?.status).toBe(429);
		expect(result.data).toMatchObject({
			error: "Too many search requests. Please try again later.",
			retryAfter: 15,
		});
		expect(listAdminUsers).not.toHaveBeenCalled();
	});
});
