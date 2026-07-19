import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURE_DISABLED_CODE } from "~/lib/feature-flags/assert-enabled.server";
import { createMockEnv, createMockFlagship } from "~/test/helpers/mock-env";

const checkRateLimit = vi.fn();
const authenticateMobileReviewLogin = vi.fn();

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

vi.mock("~/lib/mobile/review-auth.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/mobile/review-auth.server")>();
	return {
		...actual,
		authenticateMobileReviewLogin: (...args: unknown[]) =>
			authenticateMobileReviewLogin(...args),
	};
});

import { MobileReviewAuthError } from "~/lib/mobile/review-auth.server";
import { action } from "~/routes/api/mobile/v1.auth.review-login";

function makeRequest(body: unknown) {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/auth/review-login",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

describe("POST /api/mobile/v1/auth/review-login", () => {
	beforeEach(() => {
		authenticateMobileReviewLogin.mockReset();
		checkRateLimit.mockReset();
		checkRateLimit.mockResolvedValue({ allowed: true });
	});

	it("returns 403 FEATURE_DISABLED when the flag is off", async () => {
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({
				getBooleanValue: vi.fn().mockResolvedValue(false),
			}),
		};
		const context = {
			cloudflare: { env },
		} as never;

		try {
			await action({
				request: makeRequest({
					email: "app-review@mayutic.com",
					password: "secret",
					tosAccepted: true,
				}),
				context,
				params: {},
			} as never);
			expect.unreachable("expected action to throw");
		} catch (error) {
			expect(error).toMatchObject({
				type: "DataWithResponseInit",
				data: { code: FEATURE_DISABLED_CODE },
				init: { status: 403 },
			});
		}
		expect(authenticateMobileReviewLogin).not.toHaveBeenCalled();
	});

	it("returns a token pair when the flag is on", async () => {
		authenticateMobileReviewLogin.mockResolvedValue({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 3600,
		});
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({
				getBooleanValue: vi.fn().mockResolvedValue(true),
			}),
			FEATURE_FLAG_OVERRIDES: JSON.stringify({ "app-review-login": true }),
		};
		const context = {
			cloudflare: { env },
		} as never;

		const result = await action({
			request: makeRequest({
				email: "app-review@mayutic.com",
				password: "secret",
				tosAccepted: true,
			}),
			context,
			params: {},
		} as never);

		expect(result).toEqual({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 3600,
		});
		expect(authenticateMobileReviewLogin).toHaveBeenCalledOnce();
		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.anything(),
			"auth_review_login",
			expect.any(String),
		);
		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.anything(),
			"auth_review_login_account",
			"app-review@mayutic.com",
		);
	});

	it("maps MobileReviewAuthError to JSON error", async () => {
		authenticateMobileReviewLogin.mockRejectedValue(
			new MobileReviewAuthError(
				"invalid_credentials",
				401,
				"Invalid credentials",
			),
		);
		const env = {
			...createMockEnv(),
			FEATURE_FLAG_OVERRIDES: JSON.stringify({ "app-review-login": true }),
		};
		const context = {
			cloudflare: { env },
		} as never;

		try {
			await action({
				request: makeRequest({
					email: "app-review@mayutic.com",
					password: "wrong",
					tosAccepted: true,
				}),
				context,
				params: {},
			} as never);
			expect.unreachable("expected action to throw");
		} catch (error) {
			expect(error).toMatchObject({
				type: "DataWithResponseInit",
				data: { code: "invalid_credentials", error: "Invalid credentials" },
				init: { status: 401 },
			});
		}
	});
});
