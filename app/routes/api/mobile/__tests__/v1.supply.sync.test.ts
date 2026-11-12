import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

const requireMobileActiveGroup = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/auth.server", () => ({
	getUserSettings: vi.fn(async () => null),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: vi.fn(async () => ({ allowed: true })),
	};
});

vi.mock("~/lib/supply.server", () => ({
	createSupplyListFromSelectedMeals: vi.fn(async () => ({
		list: { id: "list-1", items: [] },
		summary: {
			addedItems: 0,
			newLines: 0,
			removedLines: 0,
			changedLines: 0,
			coveredByCargo: 0,
			skippedItems: 0,
			mealsProcessed: 0,
			totalIngredients: 0,
		},
	})),
}));

const env = createMockEnv();

function post(headers: Record<string, string>) {
	return new Request("http://localhost/api/mobile/v1/supply/sync", {
		method: "POST",
		headers,
	});
}

describe("POST /api/mobile/v1/supply/sync cargo plan lines", () => {
	beforeEach(() => {
		requireMobileActiveGroup.mockReset();
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user-1",
			organizationId: "org-1",
		});
	});

	async function sync(headers: Record<string, string>) {
		const { action } = await import("~/routes/api/mobile/v1.supply.sync");
		const { createSupplyListFromSelectedMeals } = await import(
			"~/lib/supply.server"
		);
		await action({
			request: post(headers),
			context: { cloudflare: { env } },
			params: {},
		} as never);
		return createSupplyListFromSelectedMeals;
	}

	it("passes false when plan-fuel-actions is off", async () => {
		const createSupplyListFromSelectedMeals = await sync({
			"X-Ration-Client": "ios/1.6.16",
			"x-ration-test-flags": JSON.stringify({
				"nutrition-fast-log": false,
				"nutrition-fuel-page": false,
				"plan-fuel-actions": false,
			}),
		});
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			env,
			"org-1",
			undefined,
			expect.objectContaining({ trigger: "mobile_supply_sync" }),
			"metric",
			"user-1",
			false,
		);
	});

	it("passes true when plan-fuel-actions and its parents are on", async () => {
		const createSupplyListFromSelectedMeals = await sync({
			"X-Ration-Client": "ios/1.6.16",
			"x-ration-test-flags": JSON.stringify({
				"nutrition-fast-log": true,
				"nutrition-fuel-page": true,
				"plan-fuel-actions": true,
			}),
		});
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			env,
			"org-1",
			undefined,
			expect.objectContaining({ trigger: "mobile_supply_sync" }),
			"metric",
			"user-1",
			true,
		);
	});

	it("stays false for iOS below 1.6.16 even when the flags are on", async () => {
		const createSupplyListFromSelectedMeals = await sync({
			"X-Ration-Client": "ios/1.6.15",
			"x-ration-test-flags": JSON.stringify({
				"nutrition-fast-log": true,
				"nutrition-fuel-page": true,
				"plan-fuel-actions": true,
			}),
		});
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			env,
			"org-1",
			undefined,
			expect.objectContaining({ trigger: "mobile_supply_sync" }),
			"metric",
			"user-1",
			false,
		);
	});
});
