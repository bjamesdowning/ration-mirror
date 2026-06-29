import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const ensureMealPlan = vi.fn();
const canShareMealPlan = vi.fn();
const generateShareToken = vi.fn();
const revokeShareToken = vi.fn();
const getMealPlanById = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/manifest.server", () => ({
	ensureMealPlan: (...args: unknown[]) => ensureMealPlan(...args),
	canShareMealPlan: (...args: unknown[]) => canShareMealPlan(...args),
	generateShareToken: (...args: unknown[]) => generateShareToken(...args),
	revokeShareToken: (...args: unknown[]) => revokeShareToken(...args),
	getMealPlanById: (...args: unknown[]) => getMealPlanById(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function postRequest() {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/manifest/share",
		{
			method: "POST",
		},
	);
}

describe("POST/DELETE /api/mobile/v1/manifest/share", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			ensureMealPlan,
			canShareMealPlan,
			generateShareToken,
			revokeShareToken,
			getMealPlanById,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		ensureMealPlan.mockResolvedValue({ id: "plan_1" });
	});

	it("returns an absolute share URL for Crew members", async () => {
		canShareMealPlan.mockResolvedValue(true);
		generateShareToken.mockResolvedValue({
			shareToken: "tok123",
			shareExpiresAt: new Date("2026-07-01T00:00:00.000Z"),
		});

		const { action } = await import("~/routes/api/mobile/v1.manifest.share");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { shareUrl: string; shareToken: string };

		expect(result.shareToken).toBe("tok123");
		expect(result.shareUrl).toBe(
			"https://ration.mayutic.com/shared/manifest/tok123",
		);
		expect(generateShareToken).toHaveBeenCalledWith({}, "org_1", "plan_1");
	});

	it("returns feature_gated 403 for non-Crew members", async () => {
		canShareMealPlan.mockResolvedValue(false);

		const { action } = await import("~/routes/api/mobile/v1.manifest.share");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { init: { status: number }; data: { error: string } };

		expect(result.init.status).toBe(403);
		expect(result.data.error).toBe("feature_gated");
		expect(generateShareToken).not.toHaveBeenCalled();
	});

	it("rejects with 429 when rate limited", async () => {
		canShareMealPlan.mockResolvedValue(true);
		checkRateLimit.mockResolvedValue({ allowed: false });

		const { action } = await import("~/routes/api/mobile/v1.manifest.share");
		await expect(
			action({ request: postRequest(), context: ctx, params: {} } as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(generateShareToken).not.toHaveBeenCalled();
	});

	it("revokes the token on DELETE", async () => {
		revokeShareToken.mockResolvedValue(undefined);

		const { action } = await import("~/routes/api/mobile/v1.manifest.share");
		const result = (await action({
			request: new Request(
				"https://ration.mayutic.com/api/mobile/v1/manifest/share",
				{ method: "DELETE" },
			),
			context: ctx,
			params: {},
		} as never)) as { revoked: boolean };

		expect(result.revoked).toBe(true);
		expect(revokeShareToken).toHaveBeenCalledWith({}, "org_1", "plan_1");
	});
});
