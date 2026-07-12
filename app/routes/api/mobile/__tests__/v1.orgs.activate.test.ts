import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileUserAuth = vi.fn();
const assertMobileOrgMembership = vi.fn();
const revokeMobileRefreshFamilies = vi.fn();
const issueMobileTokenPair = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileUserAuth: (...args: unknown[]) => requireMobileUserAuth(...args),
}));

vi.mock("~/lib/mobile/token.server", () => ({
	assertMobileOrgMembership: (...args: unknown[]) =>
		assertMobileOrgMembership(...args),
	revokeMobileRefreshFamilies: (...args: unknown[]) =>
		revokeMobileRefreshFamilies(...args),
	issueMobileTokenPair: (...args: unknown[]) => issueMobileTokenPair(...args),
}));

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const targetOrgId = "22222222-2222-4222-8222-222222222222";

function activateRequest() {
	return new Request(
		`https://ration.mayutic.com/api/mobile/v1/orgs/${targetOrgId}/activate`,
		{ method: "POST" },
	);
}

describe("POST /api/mobile/v1/orgs/:id/activate", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileUserAuth,
			assertMobileOrgMembership,
			revokeMobileRefreshFamilies,
			issueMobileTokenPair,
		]) {
			m.mockReset();
		}
		requireMobileUserAuth.mockResolvedValue({ userId: "user_1" });
		assertMobileOrgMembership.mockResolvedValue(undefined);
		revokeMobileRefreshFamilies.mockResolvedValue(undefined);
		issueMobileTokenPair.mockResolvedValue({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 3600,
		});
	});

	it("activates a target org using user-only auth (stale JWT org allowed)", async () => {
		const { action } = await import("~/routes/api/mobile/v1.orgs.$id.activate");
		const result = await action({
			request: activateRequest(),
			context: ctx,
			params: { id: targetOrgId },
		} as never);

		expect(requireMobileUserAuth).toHaveBeenCalled();
		expect(assertMobileOrgMembership).toHaveBeenCalledWith(
			env,
			"user_1",
			targetOrgId,
		);
		expect(revokeMobileRefreshFamilies).toHaveBeenCalledWith(env, "user_1");
		expect(result).toEqual({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 3600,
		});
	});

	it("rejects when the user is not a member of the target org", async () => {
		assertMobileOrgMembership.mockRejectedValue(new Error("forbidden_org"));
		const { action } = await import("~/routes/api/mobile/v1.orgs.$id.activate");
		await expect(
			action({
				request: activateRequest(),
				context: ctx,
				params: { id: targetOrgId },
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
	});
});
