import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const checkRateLimit = vi.fn();
const loadHeavyAdminMetrics = vi.fn();

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

vi.mock("~/lib/admin-loader.server", () => ({
	loadHeavyAdminMetrics: (...args: unknown[]) => loadHeavyAdminMetrics(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({}),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

const mockMetrics = {
	dauWauMau: {
		status: "ok" as const,
		data: { dau: 1, wau: 2, mau: 3, stickiness: 33.3 },
	},
	activationRate: {
		status: "ok" as const,
		data: { rate: 50, activatedCount: 5, totalUsers: 10 },
	},
	crewHealth: {
		status: "ok" as const,
		data: { activeCrew: 1, expiringSoon: 0, cancelPending: 0 },
	},
	orgMedians: {
		status: "ok" as const,
		data: { medianCargo: 1, medianMeals: 2, medianScans: 0 },
	},
	platformSplit: {
		status: "ok" as const,
		data: {
			activeWebSessions: 1,
			activeMobileTokens: 0,
			distinctWebUsers: 1,
			distinctMobileUsers: 0,
		},
	},
	aiBurnByFeature: { status: "ok" as const, data: [] },
	cachedAt: Date.now(),
};

describe("GET /api/admin/metrics", () => {
	beforeEach(() => {
		for (const mock of [requireAdmin, checkRateLimit, loadHeavyAdminMetrics]) {
			mock.mockReset();
		}
		requireAdmin.mockResolvedValue({ id: "admin_1", isAdmin: true });
		checkRateLimit.mockResolvedValue({ allowed: true });
		loadHeavyAdminMetrics.mockResolvedValue(mockMetrics);
	});

	it("requires admin and applies admin_metrics rate limit", async () => {
		const { loader } = await import("~/routes/api/admin.metrics");
		const result = await loader({
			request: new Request("https://ration.mayutic.com/api/admin/metrics"),
			context: ctx,
			params: {},
		} as never);

		expect(requireAdmin).toHaveBeenCalled();
		expect(checkRateLimit).toHaveBeenCalledWith({}, "admin_metrics", "admin_1");
		expect(loadHeavyAdminMetrics).toHaveBeenCalled();
		expect(result).toEqual(mockMetrics);
	});

	it("returns 429 without throwing when rate limit is exceeded", async () => {
		checkRateLimit.mockResolvedValue({
			allowed: false,
			retryAfter: 20,
			resetAt: 1_700_000_000_000,
		});

		const { loader } = await import("~/routes/api/admin.metrics");
		const result = (await loader({
			request: new Request("https://ration.mayutic.com/api/admin/metrics"),
			context: ctx,
			params: {},
		} as never)) as {
			init?: { status: number };
			data: Record<string, unknown>;
		};

		expect(result.init?.status).toBe(429);
		expect(result.data).toMatchObject({
			error: "Too many metrics requests. Please try again later.",
			retryAfter: 20,
		});
		expect(loadHeavyAdminMetrics).not.toHaveBeenCalled();
	});
});
