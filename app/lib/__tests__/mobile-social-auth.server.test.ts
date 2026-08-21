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
const insertValues = vi.fn();
const updateUser = vi.fn().mockReturnValue({ where: vi.fn() });
const kvPut = vi.fn().mockResolvedValue(undefined);
const kvDelete = vi.fn().mockResolvedValue(undefined);

let memberPresent = true;

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
		insert: vi.fn().mockReturnValue({ values: insertValues }),
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
	RATION_KV: { put: kvPut, get: vi.fn(), delete: kvDelete },
} as unknown as Cloudflare.Env;

describe("authenticateMobileSocial", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		memberPresent = true;
		signInSocial.mockResolvedValue({ user: { id: "user-1" } });
		findFirstUser.mockResolvedValue({
			tosAcceptedAt: new Date("2026-01-01"),
			name: "Existing User",
			email: "user@example.com",
		});
		findFirstOrg.mockResolvedValue({
			id: "org-1",
			slug: "personal-user-1",
			metadata: { isPersonal: true },
		});
		findFirstMember.mockImplementation(async () =>
			memberPresent ? { id: "m-1" } : undefined,
		);
		insertValues.mockImplementation(async () => {
			memberPresent = true;
		});
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
		expect(kvDelete).toHaveBeenCalled();
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

	it("clears planted signup intent when Better Auth rejects a forged token", async () => {
		signInSocial.mockRejectedValue(new Error("invalid token"));

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: googleIdToken("victim@example.com"),
				intent: "signUp",
				tosAccepted: true,
			}),
		).rejects.toMatchObject({
			code: "authentication_failed",
			status: 401,
		});

		expect(kvPut).toHaveBeenCalled();
		expect(kvDelete).toHaveBeenCalled();
	});

	it("maps signup_disabled on Sign Up to signup_disabled", async () => {
		signInSocial.mockRejectedValue({
			code: "signup_disabled",
			message: "Signup is disabled",
		});

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: googleIdToken("new@example.com"),
				intent: "signUp",
				tosAccepted: true,
			}),
		).rejects.toMatchObject({
			code: "signup_disabled",
			status: 403,
		});
		expect(kvDelete).toHaveBeenCalled();
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

	it("returns 404 account_not_found without calling Better Auth when Sign In email is unknown", async () => {
		findFirstUser.mockResolvedValue(undefined);

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: googleIdToken("new@example.com"),
				intent: "signIn",
			}),
		).rejects.toMatchObject({
			code: "account_not_found",
			status: 404,
			message: "No account found. Create an account instead.",
		});
		expect(signInSocial).not.toHaveBeenCalled();
		expect(issueMobileTokenPair).not.toHaveBeenCalled();
	});

	it("does not forward Apple fullName to Better Auth on Sign In", async () => {
		await authenticateMobileSocial(env, {
			provider: "apple",
			idToken: googleIdToken("user@example.com"),
			nonce: "raw-nonce",
			intent: "signIn",
			fullName: { givenName: "Ada", familyName: "Lovelace" },
		});

		expect(signInSocial).toHaveBeenCalledWith({
			body: {
				provider: "apple",
				idToken: {
					token: expect.any(String),
					nonce: "raw-nonce",
				},
			},
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
				idToken: googleIdToken("user@example.com"),
				intent: "signIn",
			}),
		).rejects.toMatchObject({
			code: "account_not_found",
			status: 404,
		});
	});

	it("maps USER_NOT_FOUND on Sign In without email to account_not_found, never 401", async () => {
		const payload = btoa(JSON.stringify({ sub: "hide-my-email" }))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		signInSocial.mockRejectedValue({
			code: "USER_NOT_FOUND",
			message: "User not found",
		});

		await expect(
			authenticateMobileSocial(env, {
				provider: "apple",
				idToken: `hdr.${payload}.sig`,
				nonce: "raw-nonce",
				intent: "signIn",
			}),
		).rejects.toMatchObject({
			code: "account_not_found",
			status: 404,
		});
		expect(signInSocial).toHaveBeenCalled();
	});

	it("inserts a member for an existing personal org before minting tokens", async () => {
		memberPresent = false;

		await authenticateMobileSocial(env, {
			provider: "google",
			idToken: googleIdToken("user@example.com"),
			intent: "signIn",
		});

		expect(insertValues).toHaveBeenCalled();
		expect(issueMobileTokenPair).toHaveBeenCalledWith(env, "user-1", "org-1");
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

	it("rethrows D1 object-reset so signup is 503 server_busy, not 401", async () => {
		const busy = new Error(
			"D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.",
		);
		signInSocial.mockRejectedValue(busy);

		await expect(
			authenticateMobileSocial(env, {
				provider: "apple",
				idToken: googleIdToken("downing@mayutic.com"),
				nonce: "raw-nonce",
				intent: "signUp",
				tosAccepted: true,
			}),
		).rejects.toBe(busy);
	});

	it("rethrows SQLITE_BUSY so signup is 503 server_busy, not 401", async () => {
		const busy = new Error("D1_ERROR: SQLITE_BUSY: database is locked");
		signInSocial.mockRejectedValue(busy);

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: googleIdToken("user@example.com"),
				intent: "signIn",
			}),
		).rejects.toBe(busy);
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
