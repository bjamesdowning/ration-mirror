import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const matchMeals = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/matching.server", () => ({
	matchMeals: (...args: unknown[]) => matchMeals(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function getRequest(extraParams: Record<string, string> = {}) {
	const params = new URLSearchParams({ mode: "delta", ...extraParams });
	return new Request(
		`https://ration.mayutic.com/api/mobile/v1/meals/match?${params.toString()}`,
	);
}

describe("GET /api/mobile/v1/meals/match preLimit", () => {
	beforeEach(() => {
		for (const m of [requireMobileActiveGroup, checkRateLimit, matchMeals]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		matchMeals.mockResolvedValue([]);
	});

	it("always includes a preLimit >= the default limit (regression: previously omitted entirely)", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.meals.match");
		await loader({ request: getRequest(), context: ctx, params: {} } as never);

		expect(matchMeals).toHaveBeenCalledTimes(1);
		const [, , query] = matchMeals.mock.calls[0] as [
			unknown,
			unknown,
			{ limit: number; preLimit?: number },
		];
		expect(query.preLimit).toBeDefined();
		expect(query.preLimit as number).toBeGreaterThanOrEqual(query.limit);
	});

	it("raises preLimit above the shared floor when a larger explicit limit is requested", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.meals.match");
		await loader({
			request: getRequest({ limit: "80" }),
			context: ctx,
			params: {},
		} as never);

		const [, , query] = matchMeals.mock.calls[0] as [
			unknown,
			unknown,
			{ limit: number; preLimit?: number },
		];
		expect(query.limit).toBe(80);
		expect(query.preLimit as number).toBeGreaterThanOrEqual(80);
	});

	it("keeps preLimit at the shared floor when the requested limit is small", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.meals.match");
		await loader({
			request: getRequest({ limit: "1" }),
			context: ctx,
			params: {},
		} as never);

		const [, , query] = matchMeals.mock.calls[0] as [
			unknown,
			unknown,
			{ limit: number; preLimit?: number },
		];
		expect(query.limit).toBe(1);
		expect(query.preLimit).toBe(12);
	});

	it("returns total equal to the number of matches", async () => {
		matchMeals.mockResolvedValue([
			{ meal: { id: "m1" }, matchPercentage: 100 },
			{ meal: { id: "m2" }, matchPercentage: 80 },
		]);

		const { loader } = await import("~/routes/api/mobile/v1.meals.match");
		const result = await loader({
			request: getRequest(),
			context: ctx,
			params: {},
		} as never);

		expect(result).toEqual({
			matches: [
				{ meal: { id: "m1" }, matchPercentage: 100 },
				{ meal: { id: "m2" }, matchPercentage: 80 },
			],
			total: 2,
		});
	});
});
