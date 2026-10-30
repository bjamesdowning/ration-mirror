import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURE_DISABLED_CODE } from "~/lib/feature-flags/assert-enabled.server";
import { createMockEnv, createMockFlagship } from "~/test/helpers/mock-env";

const requireMobileActiveGroup = vi.fn();
const getMacrosHistory = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("~/lib/mobile/auth.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/mobile/auth.server")>();
	return {
		...actual,
		requireMobileActiveGroup: (...args: unknown[]) =>
			requireMobileActiveGroup(...args),
	};
});

vi.mock("~/lib/nutrition/service.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/nutrition/service.server")>();
	return {
		...actual,
		getMacrosHistory: (...args: unknown[]) => getMacrosHistory(...args),
	};
});

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

import { loader } from "~/routes/api/mobile/v1.nutrition.macros";

const summary = {
	from: "2026-10-25",
	to: "2026-10-31",
	totals: { energyKcal: 1400, proteinG: 90, carbsG: 120, fatG: 40 },
	days: [
		{
			date: "2026-10-25",
			energyKcal: 1400,
			proteinG: 90,
			carbsG: 120,
			fatG: 40,
			coverageAvg: 1,
			entryCount: 2,
		},
	],
	goal: null,
};

function makeContext(flagOn: boolean) {
	const env = {
		...createMockEnv(),
		FLAGS: createMockFlagship({
			getBooleanValue: vi.fn().mockResolvedValue(flagOn),
		}),
	};
	return { cloudflare: { env } } as never;
}

function makeRequest() {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/nutrition/macros?from=2026-10-25&to=2026-10-31",
		{ headers: { "X-Ration-Client": "ios/1.5.10" } },
	);
}

describe("GET /api/mobile/v1/nutrition/macros", () => {
	beforeEach(() => {
		requireMobileActiveGroup.mockReset();
		getMacrosHistory.mockReset();
		checkRateLimit.mockReset();
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user-1",
			organizationId: "org-1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
	});

	it("returns 403 FEATURE_DISABLED when the flag is off", async () => {
		try {
			await loader({
				request: makeRequest(),
				context: makeContext(false),
				params: {},
			} as never);
			expect.unreachable("expected loader to throw");
		} catch (error) {
			expect(error).toMatchObject({
				type: "DataWithResponseInit",
				data: { code: FEATURE_DISABLED_CODE },
				init: { status: 403 },
			});
		}
		expect(getMacrosHistory).not.toHaveBeenCalled();
	});

	it("returns both periods when the flag is on", async () => {
		getMacrosHistory.mockResolvedValue({
			current: summary,
			previous: { ...summary, from: "2026-10-18", to: "2026-10-24" },
			notes: [
				{
					id: "note-1",
					date: "2026-10-25",
					mealName: "Oats",
					notes: "Late breakfast",
					energyKcal: 400,
					proteinG: 15,
					carbsG: 50,
					fatG: 10,
				},
			],
		});
		const result = await loader({
			request: makeRequest(),
			context: makeContext(true),
			params: {},
		} as never);
		expect(result).toMatchObject({
			current: { from: "2026-10-25", to: "2026-10-31" },
			previous: { from: "2026-10-18", to: "2026-10-24" },
			notes: [{ id: "note-1", notes: "Late breakfast" }],
		});
		expect(getMacrosHistory).toHaveBeenCalledOnce();
	});
});
