import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATION_ORG_CLAIM } from "../../oauth.constants";

const {
	jwtVerifyMock,
	createLocalJWKSetMock,
	memberFindFirst,
	consentFindFirst,
} = vi.hoisted(() => ({
	jwtVerifyMock: vi.fn(),
	createLocalJWKSetMock: vi.fn(() => "jwks-fn"),
	memberFindFirst: vi.fn(),
	consentFindFirst: vi.fn(),
}));

vi.mock("jose", () => ({
	jwtVerify: jwtVerifyMock,
	createLocalJWKSet: createLocalJWKSetMock,
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		query: {
			member: { findFirst: memberFindFirst },
			oauthConsent: { findFirst: consentFindFirst },
		},
	})),
}));

const { verifyMcpOAuthToken } = await import("../oauth-token.server");

const ISSUER = "https://ration.mayutic.com";
const AUDIENCE = "https://mcp.ration.mayutic.com/mcp";

class NoMatchingKeyError extends Error {
	code = "ERR_JWKS_NO_MATCHING_KEY";
}

function makeEnv(): Cloudflare.Env {
	return {
		BETTER_AUTH_URL: ISSUER,
		DB: {} as D1Database,
		RATION_KV: {
			// Cached JWKS so the happy path does not hit the network.
			get: vi.fn().mockResolvedValue(JSON.stringify({ keys: [] })),
			put: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
		},
	} as unknown as Cloudflare.Env;
}

function validPayload(overrides: Record<string, unknown> = {}) {
	return {
		sub: "user-1",
		aud: AUDIENCE,
		[RATION_ORG_CLAIM]: "org-1",
		scope: "mcp:read mcp:inventory:write offline_access",
		client_id: "client-1",
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	memberFindFirst.mockResolvedValue({ id: "member-1" });
	consentFindFirst.mockResolvedValue({ id: "consent-1" });
	jwtVerifyMock.mockResolvedValue({ payload: validPayload() });
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ keys: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("verifyMcpOAuthToken", () => {
	it("returns identity, org, and mcp-only scopes for a valid token", async () => {
		const result = await verifyMcpOAuthToken(makeEnv(), "a.b.c");

		expect(result).toEqual({
			userId: "user-1",
			organizationId: "org-1",
			scopes: ["mcp:read", "mcp:inventory:write"],
			clientId: "client-1",
		});
	});

	it("rejects a credential that is not JWT-shaped without touching jose", async () => {
		await expect(verifyMcpOAuthToken(makeEnv(), "rtn_live_x")).rejects.toThrow(
			"Invalid OAuth access token",
		);
		expect(jwtVerifyMock).not.toHaveBeenCalled();
	});

	it("rejects when signature verification fails", async () => {
		jwtVerifyMock.mockRejectedValueOnce(new Error("bad signature"));
		await expect(verifyMcpOAuthToken(makeEnv(), "a.b.c")).rejects.toThrow(
			"Invalid OAuth access token",
		);
	});

	it("rejects when the token audience does not match the MCP resource", async () => {
		jwtVerifyMock.mockResolvedValueOnce({
			payload: validPayload({ aud: "https://evil.example.com/mcp" }),
		});
		await expect(verifyMcpOAuthToken(makeEnv(), "a.b.c")).rejects.toThrow(
			"OAuth token audience mismatch",
		);
	});

	it("rejects when the org-binding claim is absent", async () => {
		jwtVerifyMock.mockResolvedValueOnce({
			payload: { sub: "user-1", aud: AUDIENCE, scope: "mcp:read" },
		});
		await expect(verifyMcpOAuthToken(makeEnv(), "a.b.c")).rejects.toThrow(
			"OAuth token missing organization binding",
		);
	});

	it("rejects when the user is no longer a member of the org", async () => {
		memberFindFirst.mockResolvedValueOnce(undefined);
		await expect(verifyMcpOAuthToken(makeEnv(), "a.b.c")).rejects.toThrow(
			"OAuth token organization access revoked",
		);
	});

	it("rejects when the token carries no mcp:* scopes", async () => {
		jwtVerifyMock.mockResolvedValueOnce({
			payload: validPayload({ scope: "offline_access profile" }),
		});
		await expect(verifyMcpOAuthToken(makeEnv(), "a.b.c")).rejects.toThrow(
			"OAuth token missing MCP scopes",
		);
	});

	it("rejects when the consent grant has been revoked", async () => {
		consentFindFirst.mockResolvedValueOnce(undefined);
		await expect(verifyMcpOAuthToken(makeEnv(), "a.b.c")).rejects.toThrow(
			"OAuth grant revoked",
		);
	});

	it("skips the consent check when the token has no client id", async () => {
		jwtVerifyMock.mockResolvedValueOnce({
			payload: validPayload({ client_id: undefined, azp: undefined }),
		});
		const result = await verifyMcpOAuthToken(makeEnv(), "a.b.c");
		expect(result.clientId).toBeUndefined();
		expect(consentFindFirst).not.toHaveBeenCalled();
	});

	it("refetches JWKS once and retries when the signing key rotated", async () => {
		jwtVerifyMock
			.mockRejectedValueOnce(new NoMatchingKeyError("no matching key"))
			.mockResolvedValueOnce({ payload: validPayload() });

		const env = makeEnv();
		const result = await verifyMcpOAuthToken(env, "a.b.c");

		expect(result.userId).toBe("user-1");
		// Cached set used first, then a forced network refetch on rotation.
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(jwtVerifyMock).toHaveBeenCalledTimes(2);
	});

	it("does not refetch JWKS for non-rotation verification errors", async () => {
		jwtVerifyMock.mockRejectedValueOnce(new Error("expired"));
		await expect(verifyMcpOAuthToken(makeEnv(), "a.b.c")).rejects.toThrow(
			"Invalid OAuth access token",
		);
		expect(fetch).not.toHaveBeenCalled();
	});
});
