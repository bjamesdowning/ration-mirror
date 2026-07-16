import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const matchMeals = vi.fn();

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

vi.mock("~/lib/matching.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/matching.server")>();
	return {
		...actual,
		matchMeals: (...args: unknown[]) => matchMeals(...args),
	};
});

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

	it("uses MEAL_MATCH_CANDIDATE_CAP (200) as preLimit for all result limits", async () => {
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
		expect(query.preLimit).toBe(200);
	});

	it("keeps candidate cap at 200 when result limit is large", async () => {
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
		expect(query.preLimit).toBe(200);
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

	it("forwards q as searchQuery to matchMeals", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.meals.match");
		await loader({
			request: getRequest({ q: "pasta" }),
			context: ctx,
			params: {},
		} as never);

		expect(matchMeals).toHaveBeenCalledTimes(1);
		const [, , query] = matchMeals.mock.calls[0] as [
			unknown,
			unknown,
			{ searchQuery?: string },
		];
		expect(query.searchQuery).toBe("pasta");
	});

	it("rejects q shorter than two characters", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.meals.match");
		await expect(
			loader({
				request: getRequest({ limit: "101" }),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 400 } });
		expect(matchMeals).not.toHaveBeenCalled();
	});
});
