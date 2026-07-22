import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockKV } from "~/test/helpers/mock-env";
import {
	buildSignupIntentCookie,
	clearSignupIntentForEmail,
	consumeSignupIntent,
	consumeSignupIntentForEmail,
	consumeSignupIntentToken,
	emailFromIdTokenPayload,
	parseSignupIntentCookie,
	putSignupIntentForEmail,
	putSignupIntentToken,
	TOS_SIGNUP_COOKIE_NAME,
} from "../tos-signup-intent.server";

describe("tos-signup-intent", () => {
	let kv: KVNamespace;
	const store = new Map<string, string>();

	beforeEach(() => {
		store.clear();
		kv = createMockKV();
		vi.mocked(kv.put).mockImplementation(async (key, value) => {
			store.set(key, typeof value === "string" ? value : String(value));
		});
		vi.mocked(kv.get).mockImplementation(
			(async (key: string) => store.get(key) ?? null) as KVNamespace["get"],
		);
		vi.mocked(kv.delete).mockImplementation(async (key) => {
			store.delete(key);
		});
	});

	it("puts and consumes email-keyed intent once", async () => {
		await putSignupIntentForEmail(kv, " Crew@Ration.App ", "2026-07-15");
		const first = await consumeSignupIntentForEmail(kv, "crew@ration.app");
		expect(first).toEqual({ tosVersion: "2026-07-15" });
		const second = await consumeSignupIntentForEmail(kv, "crew@ration.app");
		expect(second).toBeNull();
	});

	it("clears email intent without consuming", async () => {
		await putSignupIntentForEmail(kv, "crew@ration.app", "2026-07-15");
		await clearSignupIntentForEmail(kv, "crew@ration.app");
		expect(await consumeSignupIntentForEmail(kv, "crew@ration.app")).toBeNull();
	});

	it("puts and consumes token intent once", async () => {
		const token = await putSignupIntentToken(kv, "2026-07-15");
		expect(token).toBeTruthy();
		const first = await consumeSignupIntentToken(kv, token);
		expect(first).toEqual({ tosVersion: "2026-07-15" });
		expect(await consumeSignupIntentToken(kv, token)).toBeNull();
	});

	it("prefers email intent over cookie token", async () => {
		await putSignupIntentForEmail(kv, "a@ration.app", "2026-07-15");
		const token = await putSignupIntentToken(kv, "other");
		const request = new Request(
			"https://ration.mayutic.com/api/auth/callback/google",
			{
				headers: { cookie: buildSignupIntentCookie(token) },
			},
		);
		const intent = await consumeSignupIntent(kv, "a@ration.app", request);
		expect(intent).toEqual({ tosVersion: "2026-07-15" });
		// Token still available because email path won.
		expect(await consumeSignupIntentToken(kv, token)).toEqual({
			tosVersion: "other",
		});
	});

	it("falls back to cookie token when email intent missing", async () => {
		const token = await putSignupIntentToken(kv, "2026-07-15");
		const request = new Request("https://example.com", {
			headers: { cookie: `${TOS_SIGNUP_COOKIE_NAME}=${token}` },
		});
		const intent = await consumeSignupIntent(kv, "missing@ration.app", request);
		expect(intent).toEqual({ tosVersion: "2026-07-15" });
	});

	it("parses signup intent cookie", () => {
		const cookie = buildSignupIntentCookie("abc-123");
		expect(parseSignupIntentCookie(cookie)).toBe("abc-123");
		expect(parseSignupIntentCookie(null)).toBeNull();
	});

	it("extracts email from id token payload", () => {
		const payload = btoa(JSON.stringify({ email: "crew@ration.app" }))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		const token = `hdr.${payload}.sig`;
		expect(emailFromIdTokenPayload(token)).toBe("crew@ration.app");
		expect(emailFromIdTokenPayload("not-a-jwt")).toBeNull();
	});
});
