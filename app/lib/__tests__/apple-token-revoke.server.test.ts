import { describe, expect, it, vi } from "vitest";
import {
	exchangeAppleAuthorizationCode,
	pickAppleRevokeCredential,
	postAppleTokenRevoke,
} from "~/lib/apple-token-revoke.server";

describe("pickAppleRevokeCredential", () => {
	it("prefers refresh_token over access_token", () => {
		expect(
			pickAppleRevokeCredential({
				refreshToken: " refresh ",
				accessToken: "access",
			}),
		).toEqual({ token: "refresh", tokenTypeHint: "refresh_token" });
	});

	it("falls back to access_token", () => {
		expect(
			pickAppleRevokeCredential({
				refreshToken: null,
				accessToken: "access-token",
			}),
		).toEqual({ token: "access-token", tokenTypeHint: "access_token" });
	});

	it("returns null when neither token is present", () => {
		expect(
			pickAppleRevokeCredential({
				refreshToken: "  ",
				accessToken: undefined,
			}),
		).toBeNull();
	});
});

describe("postAppleTokenRevoke", () => {
	it("posts form-urlencoded body to Apple revoke endpoint", async () => {
		const fetchImpl = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) =>
				new Response(null, { status: 200 }),
		);
		const result = await postAppleTokenRevoke({
			clientId: "com.mayutic.ration",
			clientSecret: "secret",
			token: "tok",
			tokenTypeHint: "refresh_token",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(result).toEqual({ ok: true, status: 200 });
		expect(fetchImpl).toHaveBeenCalledOnce();
		const call = fetchImpl.mock.calls[0];
		expect(call).toBeDefined();
		if (!call) return;
		const [url, init] = call;
		expect(url).toBe("https://appleid.apple.com/auth/revoke");
		expect(init?.method).toBe("POST");
		expect(init?.headers).toEqual({
			"Content-Type": "application/x-www-form-urlencoded",
		});
		expect(String(init?.body)).toContain("client_id=com.mayutic.ration");
		expect(String(init?.body)).toContain("token_type_hint=refresh_token");
	});
});

describe("exchangeAppleAuthorizationCode", () => {
	it("posts the code and returns Apple's refresh token", async () => {
		const fetchImpl = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) =>
				Response.json({ refresh_token: "r-tok", access_token: "a" }),
		);
		const token = await exchangeAppleAuthorizationCode({
			clientId: "com.mayutic.ration",
			clientSecret: "secret",
			code: "c-123",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(token).toBe("r-tok");
		const call = fetchImpl.mock.calls[0];
		expect(call?.[0]).toBe("https://appleid.apple.com/auth/token");
		const body = String(call?.[1]?.body);
		expect(body).toContain("grant_type=authorization_code");
		expect(body).toContain("code=c-123");
		expect(body).toContain("client_id=com.mayutic.ration");
	});

	it("returns null when Apple rejects the code", async () => {
		const fetchImpl = vi.fn(async () =>
			Response.json({ error: "invalid_grant" }, { status: 400 }),
		);
		const token = await exchangeAppleAuthorizationCode({
			clientId: "com.mayutic.ration",
			clientSecret: "secret",
			code: "used",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(token).toBeNull();
	});
});
