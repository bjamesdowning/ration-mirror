import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getMeals = vi.fn();
const getMealsCount = vi.fn();
const getActiveMealIds = vi.fn();

vi.mock("~/lib/meal-selection.server", () => ({
	getActiveMealIds: (...args: unknown[]) => getActiveMealIds(...args),
}));

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/meals.server", () => ({
	getMeals: (...args: unknown[]) => getMeals(...args),
	getMealsCount: (...args: unknown[]) => getMealsCount(...args),
	createMeal: vi.fn(),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function getRequest(extraParams: Record<string, string> = {}) {
	const params = new URLSearchParams(extraParams);
	const query = params.toString();
	return new Request(
		`https://ration.mayutic.com/api/mobile/v1/meals${query ? `?${query}` : ""}`,
	);
}

describe("GET /api/mobile/v1/meals", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			getMeals,
			getMealsCount,
			getActiveMealIds,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		getMeals.mockResolvedValue([{ id: "meal_1", name: "pasta" }]);
		getMealsCount.mockResolvedValue(42);
		getActiveMealIds.mockResolvedValue(["meal_1"]);
	});

	it("returns meals and org-wide total in parallel", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.meals");
		const result = await loader({
			request: getRequest({ tag: "dinner" }),
			context: ctx,
			params: {},
		} as never);

		expect(getMeals).toHaveBeenCalledWith({}, "org_1", "dinner", undefined, {
			limit: 50,
		});
		expect(getMealsCount).toHaveBeenCalledWith({}, "org_1");
		expect(getActiveMealIds).toHaveBeenCalledWith({}, "org_1");
		expect(result).toEqual({
			meals: [{ id: "meal_1", name: "pasta" }],
			total: 42,
			activeMealIds: ["meal_1"],
		});
	});

	it("uses org-wide total even when meals list is domain-filtered", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.meals");
		await loader({
			request: getRequest({ domain: "food" }),
			context: ctx,
			params: {},
		} as never);

		expect(getMeals).toHaveBeenCalledWith({}, "org_1", undefined, "food", {
			limit: 50,
		});
		expect(getMealsCount).toHaveBeenCalledWith({}, "org_1");
	});
});
