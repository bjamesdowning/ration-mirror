import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const readMobileAuthCode = vi.fn();
const deleteMobileAuthCode = vi.fn();
const verifyPkceChallenge = vi.fn();
const issueMobileTokenPair = vi.fn();

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/mobile/token.server", () => ({
	readMobileAuthCode: (...args: unknown[]) => readMobileAuthCode(...args),
	deleteMobileAuthCode: (...args: unknown[]) => deleteMobileAuthCode(...args),
	issueMobileTokenPair: (...args: unknown[]) => issueMobileTokenPair(...args),
	rotateMobileRefreshToken: vi.fn(),
}));

vi.mock("~/lib/mobile/pkce", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/mobile/pkce")>();
	return {
		...actual,
		verifyPkceChallenge: (...args: unknown[]) => verifyPkceChallenge(...args),
	};
});

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const code = "11111111-1111-4111-8111-111111111111";
const verifier = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHI";

function tokenRequest(body: Record<string, unknown>) {
	return new Request("https://ration.mayutic.com/api/mobile/v1/auth/token", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/mobile/v1/auth/token", () => {
	beforeEach(() => {
		for (const m of [
			checkRateLimit,
			readMobileAuthCode,
			deleteMobileAuthCode,
			verifyPkceChallenge,
			issueMobileTokenPair,
		]) {
			m.mockReset();
		}
		checkRateLimit.mockResolvedValue({ allowed: true });
		readMobileAuthCode.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
			codeChallenge: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHI",
		});
		verifyPkceChallenge.mockResolvedValue(true);
		issueMobileTokenPair.mockResolvedValue({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 900,
		});
	});

	it("exchanges a valid authorization code", async () => {
		const { action } = await import("~/routes/api/mobile/v1.auth.token");
		const result = (await action({
			request: tokenRequest({
				grantType: "authorization_code",
				code,
				codeVerifier: verifier,
			}),
			context: ctx,
			params: {},
		} as never)) as { accessToken: string };

		expect(result.accessToken).toBe("access");
		expect(deleteMobileAuthCode).toHaveBeenCalledWith(env.RATION_KV, code);
	});

	it("does not delete the code when PKCE verification fails", async () => {
		verifyPkceChallenge.mockResolvedValue(false);
		const { action } = await import("~/routes/api/mobile/v1.auth.token");
		await expect(
			action({
				request: tokenRequest({
					grantType: "authorization_code",
					code,
					codeVerifier: verifier,
				}),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 400 } });
		expect(deleteMobileAuthCode).not.toHaveBeenCalled();
	});
});
