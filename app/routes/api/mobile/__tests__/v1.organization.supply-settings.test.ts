import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getOrganizationMetadata = vi.fn();
const patchOrganizationSupplySettings = vi.fn();
const resolveSupplyContext = vi.fn();

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

vi.mock("~/lib/org-supply-settings.server", () => ({
	getOrganizationMetadata: (...args: unknown[]) =>
		getOrganizationMetadata(...args),
	patchOrganizationSupplySettings: (...args: unknown[]) =>
		patchOrganizationSupplySettings(...args),
	resolveSupplyContext: (...args: unknown[]) => resolveSupplyContext(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function patchRequest(body: unknown) {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/organization/supply-settings",
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

describe("PATCH /api/mobile/v1/organization/supply-settings", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			getOrganizationMetadata,
			patchOrganizationSupplySettings,
			resolveSupplyContext,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user-1",
			organizationId: "org-1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
	});

	it("returns 403 when patch is forbidden for members", async () => {
		patchOrganizationSupplySettings.mockRejectedValue(
			new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
		);

		const { action } = await import(
			"~/routes/api/mobile/v1.organization.supply-settings"
		);
		const response = await action({
			request: patchRequest({ manifestHorizonDays: 14 }),
			context: ctx,
		} as never);

		expect(response).toBeInstanceOf(Response);
		expect((response as Response).status).toBe(403);
	});

	it("patches horizon for owner/admin", async () => {
		patchOrganizationSupplySettings.mockResolvedValue({
			supplySettings: { manifestHorizonDays: 14 },
			window: {
				startDate: "2026-07-11",
				endDate: "2026-07-24",
				horizonDays: 14,
			},
		});

		const { action } = await import(
			"~/routes/api/mobile/v1.organization.supply-settings"
		);
		const response = await action({
			request: patchRequest({ manifestHorizonDays: 14 }),
			context: ctx,
		} as never);

		expect(patchOrganizationSupplySettings).toHaveBeenCalledWith(
			{},
			"org-1",
			"user-1",
			{ manifestHorizonDays: 14 },
		);
		expect(response).toEqual({
			supplySettings: { manifestHorizonDays: 14 },
			window: {
				startDate: "2026-07-11",
				endDate: "2026-07-24",
				horizonDays: 14,
			},
		});
	});
});
