import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	authenticateMobileSocial,
	MobileSocialAuthError,
} from "../mobile/social-auth.server";

const signInSocial = vi.fn();
const issueMobileTokenPair = vi.fn();
const findFirstUser = vi.fn();
const findFirstMember = vi.fn();
const findFirstOrg = vi.fn();
const updateUser = vi.fn().mockReturnValue({ where: vi.fn() });
const kvPut = vi.fn().mockResolvedValue(undefined);

vi.mock("~/lib/auth.server", () => ({
	getAuth: () => ({
		api: { signInSocial },
	}),
}));

vi.mock("~/lib/mobile/token.server", () => ({
	issueMobileTokenPair: (...args: unknown[]) => issueMobileTokenPair(...args),
}));

vi.mock("~/lib/welcome-credits.server", () => ({
	grantWelcomeCreditsIfEligible: vi.fn().mockResolvedValue(false),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			user: { findFirst: findFirstUser },
			member: { findFirst: findFirstMember },
			organization: { findFirst: findFirstOrg },
		},
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				}),
			}),
		}),
		insert: vi.fn().mockReturnValue({ values: vi.fn() }),
		batch: vi.fn().mockResolvedValue(undefined),
		update: () => ({ set: () => ({ where: updateUser }) }),
	}),
}));

function googleIdToken(email: string): string {
	const payload = btoa(JSON.stringify({ email }))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return `hdr.${payload}.sig`;
}

const env = {
	DB: {},
	RATION_KV: { put: kvPut, get: vi.fn(), delete: vi.fn() },
} as unknown as Cloudflare.Env;

describe("authenticateMobileSocial", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		signInSocial.mockResolvedValue({ user: { id: "user-1" } });
		findFirstUser.mockResolvedValue({
			tosAcceptedAt: new Date("2026-01-01"),
			name: "Existing User",
			email: "user@example.com",
		});
		findFirstOrg.mockResolvedValue({ id: "org-1" });
		issueMobileTokenPair.mockResolvedValue({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 900,
		});
	});

	it("exchanges a Google idToken for a mobile token pair on Sign In", async () => {
		const result = await authenticateMobileSocial(env, {
			provider: "google",
			idToken: googleIdToken("user@example.com"),
			accessToken: "google-access",
			intent: "signIn",
		});

		expect(signInSocial).toHaveBeenCalledWith({
			body: {
				provider: "google",
				idToken: {
					token: expect.any(String),
					accessToken: "google-access",
				},
			},
		});
		expect(kvPut).not.toHaveBeenCalled();
		expect(issueMobileTokenPair).toHaveBeenCalledWith(env, "user-1", "org-1");
		expect(result.accessToken).toBe("access");
	});

	it("passes requestSignUp and stores ToS intent on Sign Up", async () => {
		findFirstUser.mockResolvedValue({ tosAcceptedAt: null, name: "" });
		await authenticateMobileSocial(env, {
			provider: "apple",
			idToken: googleIdToken("ada@ration.app"),
			nonce: "raw-nonce",
			intent: "signUp",
			tosAccepted: true,
			fullName: { givenName: "Ada", familyName: "Lovelace" },
		});

		expect(kvPut).toHaveBeenCalled();
		expect(signInSocial).toHaveBeenCalledWith({
			body: {
				provider: "apple",
				idToken: {
					token: expect.any(String),
					nonce: "raw-nonce",
					user: {
						name: { firstName: "Ada", lastName: "Lovelace" },
					},
				},
				requestSignUp: true,
			},
		});
		expect(updateUser).toHaveBeenCalled();
	});

	it("rejects Sign Up without ToS acceptance", async () => {
		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: googleIdToken("user@example.com"),
				intent: "signUp",
			}),
		).rejects.toMatchObject({
			code: "tos_required",
			status: 403,
		});
	});

	it("rejects Sign Up when id token has no email claim", async () => {
		const payload = btoa(JSON.stringify({ sub: "no-email" }))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: `hdr.${payload}.sig`,
				intent: "signUp",
				tosAccepted: true,
			}),
		).rejects.toMatchObject({
			code: "email_required",
			status: 400,
		});
	});

	it("maps signup_disabled on Sign In to account_not_found", async () => {
		signInSocial.mockRejectedValue({
			code: "signup_disabled",
			message: "Signup is disabled",
		});

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: googleIdToken("new@example.com"),
				intent: "signIn",
			}),
		).rejects.toMatchObject({
			code: "account_not_found",
			status: 404,
		});
	});

	it("returns generic authentication failure when Better Auth rejects token", async () => {
		signInSocial.mockRejectedValue(new Error("invalid token"));

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: "bad-token",
				intent: "signIn",
			}),
		).rejects.toBeInstanceOf(MobileSocialAuthError);

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: "bad-token",
				intent: "signIn",
			}),
		).rejects.toMatchObject({
			code: "authentication_failed",
			status: 401,
			message: "Authentication failed",
		});
	});

	it("provisions a personal org when none exists yet", async () => {
		findFirstOrg.mockResolvedValue(null);

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: googleIdToken("user@example.com"),
				intent: "signIn",
			}),
		).resolves.toBeDefined();

		expect(issueMobileTokenPair).toHaveBeenCalled();
	});
});
