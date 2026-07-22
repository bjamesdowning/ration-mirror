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

const env = { DB: {} } as Cloudflare.Env;

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

	it("exchanges a Google idToken for a mobile token pair", async () => {
		const result = await authenticateMobileSocial(env, {
			provider: "google",
			idToken: "google-id-token",
			accessToken: "google-access",
			tosAccepted: true,
		});

		expect(signInSocial).toHaveBeenCalledWith({
			body: {
				provider: "google",
				idToken: {
					token: "google-id-token",
					accessToken: "google-access",
				},
			},
		});
		expect(issueMobileTokenPair).toHaveBeenCalledWith(env, "user-1", "org-1");
		expect(result.accessToken).toBe("access");
	});

	it("exchanges an Apple idToken with nonce for a mobile token pair", async () => {
		await authenticateMobileSocial(env, {
			provider: "apple",
			idToken: "apple-id-token",
			nonce: "raw-nonce",
			tosAccepted: true,
			fullName: { givenName: "Ada", familyName: "Lovelace" },
		});

		expect(signInSocial).toHaveBeenCalledWith({
			body: {
				provider: "apple",
				idToken: {
					token: "apple-id-token",
					nonce: "raw-nonce",
					user: {
						name: { firstName: "Ada", lastName: "Lovelace" },
					},
				},
				requestSignUp: true,
			},
		});
		expect(issueMobileTokenPair).toHaveBeenCalledWith(env, "user-1", "org-1");
	});

	it("rejects requests without ToS acceptance", async () => {
		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: "google-id-token",
				tosAccepted: true,
			}),
		).resolves.toBeDefined();

		findFirstUser.mockResolvedValue({ tosAcceptedAt: null, name: "" });

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: "google-id-token",
				// @ts-expect-error — schema requires tosAccepted; test server-side guard
				tosAccepted: false,
			}),
		).rejects.toMatchObject({
			code: "tos_required",
			status: 403,
		});
	});

	it("stamps ToS when accepted for users without prior acceptance", async () => {
		findFirstUser.mockResolvedValue({ tosAcceptedAt: null, name: "" });

		await authenticateMobileSocial(env, {
			provider: "google",
			idToken: "google-id-token",
			tosAccepted: true,
		});

		expect(updateUser).toHaveBeenCalled();
	});

	it("returns generic authentication failure when Better Auth rejects token", async () => {
		signInSocial.mockRejectedValue(new Error("invalid token"));

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: "bad-token",
				tosAccepted: true,
			}),
		).rejects.toBeInstanceOf(MobileSocialAuthError);

		await expect(
			authenticateMobileSocial(env, {
				provider: "google",
				idToken: "bad-token",
				tosAccepted: true,
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
				idToken: "google-id-token",
				tosAccepted: true,
			}),
		).resolves.toBeDefined();

		expect(issueMobileTokenPair).toHaveBeenCalled();
	});
});
