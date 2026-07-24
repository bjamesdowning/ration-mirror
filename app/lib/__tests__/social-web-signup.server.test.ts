import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv, createMockKV } from "~/test/helpers/mock-env";
import {
	ACCOUNT_NOT_FOUND_CODE,
	ACCOUNT_NOT_FOUND_MESSAGE,
} from "../auth-sign-in-guard.server";
import {
	prepareWebSignupIntent,
	withSignupIntentCookie,
} from "../social-web-signup.server";
import {
	putSignupIntentForEmail,
	TOS_SIGNUP_COOKIE_NAME,
} from "../tos-signup-intent.server";

const assertExistingUserForSignIn = vi.fn();

vi.mock("~/lib/auth-sign-in-guard.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/auth-sign-in-guard.server")>();
	return {
		...actual,
		assertExistingUserForSignIn: (...args: unknown[]) =>
			assertExistingUserForSignIn(...args),
	};
});

describe("prepareWebSignupIntent", () => {
	const store = new Map<string, string>();
	let env: Cloudflare.Env;

	beforeEach(() => {
		store.clear();
		assertExistingUserForSignIn.mockReset();
		assertExistingUserForSignIn.mockResolvedValue(undefined);
		const kv = createMockKV();
		vi.mocked(kv.put).mockImplementation(async (key, value) => {
			store.set(key, typeof value === "string" ? value : String(value));
		});
		vi.mocked(kv.get).mockImplementation(
			(async (key: string) => store.get(key) ?? null) as KVNamespace["get"],
		);
		vi.mocked(kv.delete).mockImplementation(async (key) => {
			store.delete(key);
		});
		env = { ...createMockEnv(), RATION_KV: kv };
	});

	it("ignores non-signup routes", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/get-session",
			{
				method: "GET",
			},
		);
		await expect(prepareWebSignupIntent(env, request)).resolves.toEqual({
			setCookie: null,
		});
	});

	it("allows social Sign In without ToS", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "google" }),
			},
		);
		await expect(prepareWebSignupIntent(env, request)).resolves.toEqual({
			setCookie: null,
		});
		expect(store.size).toBe(0);
	});

	it("clears planted email intent on Sign In magic-link", async () => {
		await putSignupIntentForEmail(env.RATION_KV, "crew@ration.app");
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/magic-link",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "crew@ration.app",
					// Sign In — no requestSignUp metadata
				}),
			},
		);
		await expect(prepareWebSignupIntent(env, request)).resolves.toEqual({
			setCookie: null,
		});
		expect(assertExistingUserForSignIn).toHaveBeenCalledWith(
			env.DB,
			"crew@ration.app",
		);
		expect(store.has("tos-signup-intent:email:crew@ration.app")).toBe(false);
	});

	it("rejects Sign In magic-link when no account exists", async () => {
		const { data } = await import("react-router");
		assertExistingUserForSignIn.mockImplementation(async () => {
			throw data(
				{
					error: ACCOUNT_NOT_FOUND_MESSAGE,
					code: ACCOUNT_NOT_FOUND_CODE,
				},
				{ status: 404 },
			);
		});
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/magic-link",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "new@ration.app" }),
			},
		);
		await expect(prepareWebSignupIntent(env, request)).rejects.toMatchObject({
			data: {
				error: ACCOUNT_NOT_FOUND_MESSAGE,
				code: ACCOUNT_NOT_FOUND_CODE,
			},
			init: { status: 404 },
		});
		expect(store.size).toBe(0);
	});

	it("rejects social Sign Up without ToS", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "google", requestSignUp: true }),
			},
		);
		await expect(prepareWebSignupIntent(env, request)).rejects.toMatchObject({
			data: { error: "tos_required" },
			init: { status: 403 },
		});
	});

	it("stores cookie token intent for social Sign Up with ToS", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "google",
					requestSignUp: true,
					additionalData: { tosAccepted: true },
				}),
			},
		);
		const result = await prepareWebSignupIntent(env, request);
		expect(result.setCookie).toContain(`${TOS_SIGNUP_COOKIE_NAME}=`);
		expect(store.size).toBe(1);
	});

	it("rejects magic-link Sign Up without ToS", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/magic-link",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "crew@ration.app",
					metadata: { requestSignUp: true },
				}),
			},
		);
		await expect(prepareWebSignupIntent(env, request)).rejects.toMatchObject({
			data: { error: "tos_required" },
			init: { status: 403 },
		});
	});

	it("stores email intent for magic-link Sign Up with ToS", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/magic-link",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "crew@ration.app",
					metadata: { requestSignUp: true, tosAccepted: true },
				}),
			},
		);
		const result = await prepareWebSignupIntent(env, request);
		expect(result.setCookie).toBeNull();
		expect(store.has("tos-signup-intent:email:crew@ration.app")).toBe(true);
	});

	it("attaches Set-Cookie via withSignupIntentCookie", () => {
		const base = new Response("ok", { status: 200 });
		const withCookie = withSignupIntentCookie(
			base,
			`${TOS_SIGNUP_COOKIE_NAME}=tok; Path=/`,
		);
		expect(withCookie.headers.get("Set-Cookie")).toContain(
			TOS_SIGNUP_COOKIE_NAME,
		);
	});
});
