import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getGroupTierLimits = vi.fn();
const getSupplyList = vi.fn();
const generateShareToken = vi.fn();
const revokeShareToken = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/capacity.server", () => ({
	getGroupTierLimits: (...args: unknown[]) => getGroupTierLimits(...args),
}));

vi.mock("~/lib/supply.server", () => ({
	getSupplyList: (...args: unknown[]) => getSupplyList(...args),
	generateShareToken: (...args: unknown[]) => generateShareToken(...args),
	revokeShareToken: (...args: unknown[]) => revokeShareToken(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function postRequest() {
	return new Request("https://ration.mayutic.com/api/mobile/v1/supply/share", {
		method: "POST",
	});
}

describe("POST/DELETE /api/mobile/v1/supply/share", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			getGroupTierLimits,
			getSupplyList,
			generateShareToken,
			revokeShareToken,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		getSupplyList.mockResolvedValue({ id: "list_1" });
	});

	it("returns an absolute share URL when the tier allows sharing", async () => {
		getGroupTierLimits.mockResolvedValue({
			tier: "crew_member",
			limits: { canShareGroceryLists: true },
		});
		generateShareToken.mockResolvedValue({
			shareToken: "stok",
			shareExpiresAt: new Date("2026-07-01T00:00:00.000Z"),
		});

		const { action } = await import("~/routes/api/mobile/v1.supply.share");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { shareUrl: string; shareToken: string };

		expect(result.shareToken).toBe("stok");
		expect(result.shareUrl).toBe("https://ration.mayutic.com/shared/stok");
		expect(generateShareToken).toHaveBeenCalledWith({}, "org_1", "list_1");
	});

	it("returns feature_gated 403 when the tier cannot share", async () => {
		getGroupTierLimits.mockResolvedValue({
			tier: "free",
			limits: { canShareGroceryLists: false },
		});

		const { action } = await import("~/routes/api/mobile/v1.supply.share");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { init: { status: number }; data: { error: string } };

		expect(result.init.status).toBe(403);
		expect(result.data.error).toBe("feature_gated");
		expect(generateShareToken).not.toHaveBeenCalled();
	});

	it("rate limits the request with a 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false });

		const { action } = await import("~/routes/api/mobile/v1.supply.share");
		await expect(
			action({ request: postRequest(), context: ctx, params: {} } as never),
		).rejects.toMatchObject({ init: { status: 429 } });
	});

	it("revokes the token on DELETE", async () => {
		getGroupTierLimits.mockResolvedValue({
			tier: "crew_member",
			limits: { canShareGroceryLists: true },
		});
		revokeShareToken.mockResolvedValue(undefined);

		const { action } = await import("~/routes/api/mobile/v1.supply.share");
		const result = (await action({
			request: new Request(
				"https://ration.mayutic.com/api/mobile/v1/supply/share",
				{ method: "DELETE" },
			),
			context: ctx,
			params: {},
		} as never)) as { revoked: boolean };

		expect(result.revoked).toBe(true);
		expect(revokeShareToken).toHaveBeenCalledWith({}, "org_1", "list_1");
	});
});
