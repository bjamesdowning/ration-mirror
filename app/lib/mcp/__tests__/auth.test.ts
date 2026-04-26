import { describe, expect, it, vi } from "vitest";
import { authenticateMcp, MCP_AUTH_ERRORS } from "../auth";

vi.mock("~/lib/api-key.server", () => ({
	verifyApiKey: vi.fn(),
}));

const { verifyApiKey } = await import("~/lib/api-key.server");

function makeRequest(headers: Record<string, string>): Request {
	return new Request("https://mcp.example.com/mcp", {
		method: "POST",
		headers: headers as HeadersInit,
	});
}

describe("authenticateMcp", () => {
	it("throws when Authorization and X-Api-Key are missing", async () => {
		const request = makeRequest({});

		await expect(
			authenticateMcp({ DB: {} as D1Database } as Cloudflare.Env, request),
		).rejects.toThrow(
			"Missing API key - provide via Authorization Bearer token",
		);
		expect(verifyApiKey).not.toHaveBeenCalled();
	});

	it("throws when verifyApiKey returns null (invalid key)", async () => {
		vi.mocked(verifyApiKey).mockResolvedValueOnce(null);

		const request = makeRequest({
			Authorization: "Bearer rtn_live_abcdef123456789012345678901234",
		});

		await expect(
			authenticateMcp({ DB: {} as D1Database } as Cloudflare.Env, request),
		).rejects.toThrow("Invalid API key");
		expect(verifyApiKey).toHaveBeenCalledTimes(1);
	});

	it("throws when key is valid but scopes omit mcp", async () => {
		vi.mocked(verifyApiKey).mockResolvedValueOnce({
			id: "key-1",
			organizationId: "org-1",
			userId: "user-1",
			keyHash: "hash",
			keyPrefix: "rtn_live_abcd1234",
			name: "Test Key",
			scopes: JSON.stringify(["inventory", "galley"]),
			lastUsedAt: null,
			createdAt: new Date(),
		});

		const request = makeRequest({
			Authorization: "Bearer rtn_live_abcdef123456789012345678901234",
		});

		await expect(
			authenticateMcp({ DB: {} as D1Database } as Cloudflare.Env, request),
		).rejects.toThrow(
			"Insufficient scope: API key must include 'mcp' or a granular 'mcp:*' scope",
		);
	});

	it("returns organizationId when key is valid and has mcp scope", async () => {
		vi.mocked(verifyApiKey).mockResolvedValueOnce({
			id: "key-1",
			organizationId: "org-abc-123",
			userId: "user-1",
			keyHash: "hash",
			keyPrefix: "rtn_live_abcd1234",
			name: "Test Key",
			scopes: JSON.stringify(["mcp", "inventory"]),
			lastUsedAt: null,
			createdAt: new Date(),
		});

		const request = makeRequest({
			Authorization: "Bearer rtn_live_abcdef123456789012345678901234",
		});

		const result = await authenticateMcp(
			{ DB: {} as D1Database } as Cloudflare.Env,
			request,
		);
		expect(result).toMatchObject({
			organizationId: "org-abc-123",
			apiKeyId: "key-1",
			userId: "user-1",
			keyName: "Test Key",
			keyPrefix: "rtn_live_abcd1234",
			scopes: ["mcp", "inventory"],
		});
		expect(verifyApiKey).toHaveBeenCalledWith(
			expect.anything(),
			"rtn_live_abcdef123456789012345678901234",
		);
	});

	it("accepts X-Api-Key header as alternative to Authorization Bearer", async () => {
		vi.mocked(verifyApiKey).mockResolvedValueOnce({
			id: "key-1",
			organizationId: "org-x-api-key",
			userId: "user-1",
			keyHash: "hash",
			keyPrefix: "rtn_live_abcd1234",
			name: "Test Key",
			scopes: JSON.stringify(["mcp"]),
			lastUsedAt: null,
			createdAt: new Date(),
		});

		const request = makeRequest({
			"X-Api-Key": "rtn_live_abcdef123456789012345678901234",
		});

		const result = await authenticateMcp(
			{ DB: {} as D1Database } as Cloudflare.Env,
			request,
		);
		expect(result).toMatchObject({
			organizationId: "org-x-api-key",
			scopes: ["mcp"],
		});
		expect(verifyApiKey).toHaveBeenCalledWith(
			expect.anything(),
			"rtn_live_abcdef123456789012345678901234",
		);
	});

	it("accepts a narrow mcp:read scope without legacy 'mcp'", async () => {
		vi.mocked(verifyApiKey).mockResolvedValueOnce({
			id: "key-1",
			organizationId: "org-narrow",
			userId: "user-1",
			keyHash: "hash",
			keyPrefix: "rtn_live_abcd1234",
			name: "Read Only",
			scopes: JSON.stringify(["mcp:read"]),
			lastUsedAt: null,
			createdAt: new Date(),
		});
		const request = makeRequest({
			Authorization: "Bearer rtn_live_abcdef123456789012345678901234",
		});
		const result = await authenticateMcp(
			{ DB: {} as D1Database } as Cloudflare.Env,
			request,
		);
		expect(result.scopes).toEqual(["mcp:read"]);
	});

	it("handles malformed scopes JSON (treats as empty, fails scope check)", async () => {
		vi.mocked(verifyApiKey).mockResolvedValueOnce({
			id: "key-1",
			organizationId: "org-1",
			userId: "user-1",
			keyHash: "hash",
			keyPrefix: "rtn_live_abcd1234",
			name: "Test Key",
			scopes: "not-valid-json",
			lastUsedAt: null,
			createdAt: new Date(),
		});

		const request = makeRequest({
			Authorization: "Bearer rtn_live_abcdef123456789012345678901234",
		});

		await expect(
			authenticateMcp({ DB: {} as D1Database } as Cloudflare.Env, request),
		).rejects.toThrow(
			"Insufficient scope: API key must include 'mcp' or a granular 'mcp:*' scope",
		);
	});
});

describe("MCP_AUTH_ERRORS", () => {
	it("contains all error messages thrown by authenticateMcp", () => {
		expect(
			MCP_AUTH_ERRORS.has(
				"Missing API key - provide via Authorization Bearer token",
			),
		).toBe(true);
		expect(MCP_AUTH_ERRORS.has("Invalid API key")).toBe(true);
		expect(
			MCP_AUTH_ERRORS.has(
				"Insufficient scope: API key must include 'mcp' or a granular 'mcp:*' scope",
			),
		).toBe(true);
		expect(MCP_AUTH_ERRORS.size).toBe(3);
	});
});
