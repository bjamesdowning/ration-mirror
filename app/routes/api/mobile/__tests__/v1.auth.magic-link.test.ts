import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ACCOUNT_NOT_FOUND_CODE,
	ACCOUNT_NOT_FOUND_MESSAGE,
} from "~/lib/auth-sign-in-guard.server";
import { createMockEnv } from "~/test/helpers/mock-env";

const checkRateLimit = vi.fn();
const assertExistingUserForSignIn = vi.fn();
const storeMobilePendingHandoff = vi.fn();
const putSignupIntentForEmail = vi.fn();
const clearSignupIntentForEmail = vi.fn();
const signInMagicLink = vi.fn();

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

vi.mock("~/lib/auth-sign-in-guard.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/auth-sign-in-guard.server")>();
	return {
		...actual,
		assertExistingUserForSignIn: (...args: unknown[]) =>
			assertExistingUserForSignIn(...args),
	};
});

vi.mock("~/lib/mobile/pending-handoff.server", () => ({
	storeMobilePendingHandoff: (...args: unknown[]) =>
		storeMobilePendingHandoff(...args),
}));

vi.mock("~/lib/tos-signup-intent.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/tos-signup-intent.server")>();
	return {
		...actual,
		putSignupIntentForEmail: (...args: unknown[]) =>
			putSignupIntentForEmail(...args),
		clearSignupIntentForEmail: (...args: unknown[]) =>
			clearSignupIntentForEmail(...args),
	};
});

vi.mock("~/lib/auth.server", () => ({
	getAuth: () => ({
		api: { signInMagicLink },
	}),
}));

import { data } from "react-router";
import { action } from "~/routes/api/mobile/v1.auth.magic-link";

function makeRequest(body: unknown) {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/auth/magic-link",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

const validChallenge = "a".repeat(43);

describe("POST /api/mobile/v1/auth/magic-link", () => {
	beforeEach(() => {
		checkRateLimit.mockReset();
		checkRateLimit.mockResolvedValue({ allowed: true });
		assertExistingUserForSignIn.mockReset();
		assertExistingUserForSignIn.mockResolvedValue(undefined);
		storeMobilePendingHandoff.mockReset();
		storeMobilePendingHandoff.mockResolvedValue("pending-1");
		putSignupIntentForEmail.mockReset();
		clearSignupIntentForEmail.mockReset();
		signInMagicLink.mockReset();
		signInMagicLink.mockResolvedValue({});
	});

	it("rejects Sign In for unknown email before handoff or email send", async () => {
		assertExistingUserForSignIn.mockImplementation(async () => {
			throw data(
				{
					error: ACCOUNT_NOT_FOUND_MESSAGE,
					code: ACCOUNT_NOT_FOUND_CODE,
				},
				{ status: 404 },
			);
		});

		const env = {
			...createMockEnv(),
			BETTER_AUTH_URL: "https://ration.mayutic.com",
		};
		const context = { cloudflare: { env } } as never;

		try {
			await action({
				request: makeRequest({
					email: "new@ration.app",
					codeChallenge: validChallenge,
					intent: "signIn",
				}),
				context,
				params: {},
			} as never);
			expect.unreachable("expected action to throw");
		} catch (error) {
			expect(error).toMatchObject({
				type: "DataWithResponseInit",
				data: {
					error: ACCOUNT_NOT_FOUND_MESSAGE,
					code: ACCOUNT_NOT_FOUND_CODE,
				},
				init: { status: 404 },
			});
		}

		expect(assertExistingUserForSignIn).toHaveBeenCalled();
		expect(storeMobilePendingHandoff).not.toHaveBeenCalled();
		expect(signInMagicLink).not.toHaveBeenCalled();
		expect(clearSignupIntentForEmail).not.toHaveBeenCalled();
		expect(putSignupIntentForEmail).not.toHaveBeenCalled();
	});

	it("sends magic link for Sign In when the account exists", async () => {
		const env = {
			...createMockEnv(),
			BETTER_AUTH_URL: "https://ration.mayutic.com",
		};
		const context = { cloudflare: { env } } as never;

		const result = await action({
			request: makeRequest({
				email: "crew@ration.app",
				codeChallenge: validChallenge,
				intent: "signIn",
			}),
			context,
			params: {},
		} as never);

		expect(result).toEqual({ sent: true });
		expect(assertExistingUserForSignIn).toHaveBeenCalledWith(
			env.DB,
			"crew@ration.app",
		);
		expect(clearSignupIntentForEmail).toHaveBeenCalled();
		expect(storeMobilePendingHandoff).toHaveBeenCalled();
		expect(signInMagicLink).toHaveBeenCalled();
		expect(putSignupIntentForEmail).not.toHaveBeenCalled();
	});

	it("plants signup intent on Create Account without existence check", async () => {
		const env = {
			...createMockEnv(),
			BETTER_AUTH_URL: "https://ration.mayutic.com",
		};
		const context = { cloudflare: { env } } as never;

		const result = await action({
			request: makeRequest({
				email: "new@ration.app",
				codeChallenge: validChallenge,
				intent: "signUp",
				tosAccepted: true,
			}),
			context,
			params: {},
		} as never);

		expect(result).toEqual({ sent: true });
		expect(assertExistingUserForSignIn).not.toHaveBeenCalled();
		expect(putSignupIntentForEmail).toHaveBeenCalled();
		expect(signInMagicLink).toHaveBeenCalled();
	});
});
