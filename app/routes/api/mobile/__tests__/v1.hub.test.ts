import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getMobileHubData = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/mobile/hub.server", () => ({
	getMobileHubData: (...args: unknown[]) => getMobileHubData(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function getRequest() {
	return new Request("https://ration.mayutic.com/api/mobile/v1/hub");
}

describe("GET /api/mobile/v1/hub", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			getMobileHubData,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		getMobileHubData.mockResolvedValue({ expiringItems: [] });
	});

	it("checks the hub_read rate limit before loading hub data", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.hub");
		await loader({ request: getRequest(), context: ctx, params: {} } as never);

		expect(checkRateLimit).toHaveBeenCalledWith({}, "hub_read", "user_1");
		expect(getMobileHubData).toHaveBeenCalledWith(
			{ DB: {}, RATION_KV: {} },
			"org_1",
			"user_1",
		);
	});

	it("returns 429 with Retry-After when rate limited, without loading hub data", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false });

		const { loader } = await import("~/routes/api/mobile/v1.hub");
		await expect(
			loader({ request: getRequest(), context: ctx, params: {} } as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(getMobileHubData).not.toHaveBeenCalled();
	});
});
