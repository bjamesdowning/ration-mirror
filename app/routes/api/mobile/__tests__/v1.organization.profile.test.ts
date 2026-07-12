import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const patchOrganizationProfile = vi.fn();

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

vi.mock("~/lib/org-profile.server", () => ({
	patchOrganizationProfile: (...args: unknown[]) =>
		patchOrganizationProfile(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function patchRequest(body: unknown) {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/organization/profile",
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

describe("PATCH /api/mobile/v1/organization/profile", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			patchOrganizationProfile,
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
		patchOrganizationProfile.mockRejectedValue(
			new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
		);

		const { action } = await import(
			"~/routes/api/mobile/v1.organization.profile"
		);
		const response = await action({
			request: patchRequest({ name: "Kitchen" }),
			context: ctx,
		} as never);

		expect(response).toBeInstanceOf(Response);
		expect((response as Response).status).toBe(403);
	});

	it("patches profile for owner/admin", async () => {
		patchOrganizationProfile.mockResolvedValue({
			id: "org-1",
			name: "Kitchen",
			slug: "kitchen",
			logo: null,
			credits: 0,
		});

		const { action } = await import(
			"~/routes/api/mobile/v1.organization.profile"
		);
		const response = await action({
			request: patchRequest({ name: "Kitchen" }),
			context: ctx,
		} as never);

		expect(response).toEqual({
			id: "org-1",
			name: "Kitchen",
			slug: "kitchen",
			logo: null,
			credits: 0,
		});
		expect(patchOrganizationProfile).toHaveBeenCalledWith(
			{},
			"org-1",
			"user-1",
			{ name: "Kitchen" },
		);
	});
});
