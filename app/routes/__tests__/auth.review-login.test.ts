import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "~/lib/auth.server";
import { FEATURE_DISABLED_CODE } from "~/lib/feature-flags/assert-enabled.server";
import { createMockEnv, createMockFlagship } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

const checkRateLimit = vi.fn();
const issueMobileTokenPair = vi.fn();

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

vi.mock("~/lib/mobile/token.server", () => ({
	issueMobileTokenPair: (...args: unknown[]) => issueMobileTokenPair(...args),
}));

import { action } from "~/routes/auth.review-login";

const REVIEW_EMAIL = "app-review@mayutic.com";
const REVIEW_PASSWORD = "review-password";
const REVIEW_USER_ID = "user-review";

function makeRequest(fields: Record<string, string>) {
	const body = new URLSearchParams(fields);
	return new Request("https://ration.mayutic.com/auth/review-login", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"CF-Connecting-IP": "203.0.113.5",
		},
		body,
	});
}

function flagEnv(
	getBooleanValue: ReturnType<typeof vi.fn>,
	extra: Record<string, unknown> = {},
) {
	return {
		...createMockEnv(),
		...extra,
		FLAGS: createMockFlagship({ getBooleanValue }),
	};
}

describe("POST /auth/review-login", () => {
	beforeEach(() => {
		checkRateLimit.mockReset();
		checkRateLimit.mockResolvedValue({ allowed: true });
		issueMobileTokenPair.mockReset();
	});

	it("returns 403 FEATURE_DISABLED when the web flag is off", async () => {
		const getBooleanValue = vi.fn().mockResolvedValue(false);
		const env = flagEnv(getBooleanValue, {
			APP_REVIEW_DEMO_EMAIL: REVIEW_EMAIL,
			APP_REVIEW_DEMO_PASSWORD: REVIEW_PASSWORD,
			APP_REVIEW_DEMO_USER_ID: REVIEW_USER_ID,
		});

		const result = await action({
			request: makeRequest({
				email: REVIEW_EMAIL,
				password: REVIEW_PASSWORD,
			}),
			context: { cloudflare: { env } },
			params: {},
		} as never);

		expect(result).toMatchObject({
			type: "DataWithResponseInit",
			data: {
				code: FEATURE_DISABLED_CODE,
				error: "This feature is temporarily unavailable.",
			},
			init: { status: 403 },
		});
		expect(getBooleanValue).toHaveBeenCalledWith(
			"app-review-login",
			false,
			expect.objectContaining({ clientPlatform: "web" }),
		);
		expect(issueMobileTokenPair).not.toHaveBeenCalled();
		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.anything(),
			"auth_review_login",
			"203.0.113.5",
		);
		expect(checkRateLimit).not.toHaveBeenCalledWith(
			expect.anything(),
			"auth_review_login_account",
			expect.anything(),
		);
	});

	it("returns 401 for the wrong password and does not set a session cookie", async () => {
		const env = flagEnv(vi.fn().mockResolvedValue(true), {
			APP_REVIEW_DEMO_EMAIL: REVIEW_EMAIL,
			APP_REVIEW_DEMO_PASSWORD: REVIEW_PASSWORD,
			APP_REVIEW_DEMO_USER_ID: REVIEW_USER_ID,
		});

		const result = await action({
			request: makeRequest({
				email: REVIEW_EMAIL,
				password: "wrong-password",
			}),
			context: { cloudflare: { env } },
			params: {},
		} as never);

		expect(result).toMatchObject({
			type: "DataWithResponseInit",
			data: { code: "invalid_credentials", error: "Invalid credentials" },
			init: { status: 401 },
		});
		expect(issueMobileTokenPair).not.toHaveBeenCalled();
		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.anything(),
			"auth_review_login_account",
			REVIEW_EMAIL,
		);
	});

	it("rejects a different email with the same unavailable credentials", async () => {
		const env = flagEnv(vi.fn().mockResolvedValue(true), {
			APP_REVIEW_DEMO_EMAIL: REVIEW_EMAIL,
			APP_REVIEW_DEMO_PASSWORD: REVIEW_PASSWORD,
			APP_REVIEW_DEMO_USER_ID: REVIEW_USER_ID,
		});

		const result = await action({
			request: makeRequest({
				email: "someone@example.com",
				password: REVIEW_PASSWORD,
			}),
			context: { cloudflare: { env } },
			params: {},
		} as never);

		expect(result).toMatchObject({
			type: "DataWithResponseInit",
			data: { code: "invalid_credentials" },
			init: { status: 401 },
		});
		expect(issueMobileTokenPair).not.toHaveBeenCalled();
	});

	it("creates a Better Auth web session cookie for the review user", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec(`
			CREATE TABLE user (
				id text PRIMARY KEY NOT NULL,
				name text NOT NULL,
				email text NOT NULL UNIQUE,
				email_verified integer NOT NULL,
				image text,
				created_at integer NOT NULL,
				updated_at integer NOT NULL,
				is_admin integer NOT NULL DEFAULT 0,
				tier text NOT NULL DEFAULT 'free',
				tier_expires_at integer,
				crew_subscribed_at integer,
				welcome_voucher_redeemed integer NOT NULL DEFAULT 0,
				stripe_customer_id text,
				subscription_cancel_at_period_end integer NOT NULL DEFAULT 0,
				tos_accepted_at integer NOT NULL DEFAULT (unixepoch()),
				tos_version text NOT NULL DEFAULT '2026-03-11',
				settings text DEFAULT '{}'
			);
			CREATE TABLE session (
				id text PRIMARY KEY NOT NULL,
				expires_at integer NOT NULL,
				token text NOT NULL UNIQUE,
				created_at integer NOT NULL,
				updated_at integer NOT NULL,
				ip_address text,
				user_agent text,
				user_id text NOT NULL,
				active_organization_id text
			);
			CREATE TABLE jwks (
				id text PRIMARY KEY NOT NULL,
				public_key text NOT NULL,
				private_key text NOT NULL,
				created_at integer NOT NULL,
				expires_at integer,
				alg text,
				crv text
			);
			INSERT INTO user (
				id, name, email, email_verified, created_at, updated_at, settings
			) VALUES (
				'${REVIEW_USER_ID}',
				'App Review',
				'${REVIEW_EMAIL}',
				1,
				unixepoch(),
				unixepoch(),
				'{}'
			);
		`);

		const env = flagEnv(vi.fn().mockResolvedValue(true), {
			DB: database,
			BETTER_AUTH_SECRET: "web-review-login-test-secret",
			BETTER_AUTH_URL: "https://ration.mayutic.com",
			APP_REVIEW_DEMO_EMAIL: REVIEW_EMAIL,
			APP_REVIEW_DEMO_PASSWORD: REVIEW_PASSWORD,
			APP_REVIEW_DEMO_USER_ID: REVIEW_USER_ID,
		});

		const result = await action({
			request: makeRequest({
				email: `  ${REVIEW_EMAIL.toUpperCase()} `,
				password: REVIEW_PASSWORD,
				callbackURL: "https://evil.example/phish",
			}),
			context: { cloudflare: { env } },
			params: {},
		} as never);

		expect(result).toBeInstanceOf(Response);
		const response = result as Response;
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/hub");
		const setCookie = response.headers.get("Set-Cookie");
		expect(setCookie).toBeTruthy();
		expect(setCookie).not.toContain(REVIEW_PASSWORD);
		expect(issueMobileTokenPair).not.toHaveBeenCalled();

		const auth = getAuth(env as never);
		const session = await auth.api.getSession({
			headers: new Headers({
				cookie: setCookie?.split(";")[0] ?? "",
			}),
		});
		expect(session?.user?.id).toBe(REVIEW_USER_ID);
		expect(session?.user?.email).toBe(REVIEW_EMAIL);
	});
});
