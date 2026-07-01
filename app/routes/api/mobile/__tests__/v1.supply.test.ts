import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getSupplyList = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/supply.server", () => ({
	getSupplyList: (...args: unknown[]) => getSupplyList(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function getRequest(query = "") {
	return new Request(`https://ration.mayutic.com/api/mobile/v1/supply${query}`);
}

describe("GET /api/mobile/v1/supply", () => {
	beforeEach(() => {
		for (const m of [requireMobileActiveGroup, checkRateLimit, getSupplyList]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		getSupplyList.mockResolvedValue({ id: "list_1", items: [] });
	});

	it("checks the supply_read rate limit and defaults limit to 200/offset to 0", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.supply");
		await loader({ request: getRequest(), context: ctx, params: {} } as never);

		expect(checkRateLimit).toHaveBeenCalledWith({}, "supply_read", "user_1");
		expect(getSupplyList).toHaveBeenCalledWith({}, "org_1", {
			limit: 200,
			offset: 0,
		});
	});

	it("parses limit/offset query params through to getSupplyList", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.supply");
		await loader({
			request: getRequest("?limit=50&offset=200"),
			context: ctx,
			params: {},
		} as never);

		expect(getSupplyList).toHaveBeenCalledWith({}, "org_1", {
			limit: 50,
			offset: 200,
		});
	});

	it("rejects with a 429 when rate limited, without loading the list", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false });

		const { loader } = await import("~/routes/api/mobile/v1.supply");
		await expect(
			loader({ request: getRequest(), context: ctx, params: {} } as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(getSupplyList).not.toHaveBeenCalled();
	});
});
