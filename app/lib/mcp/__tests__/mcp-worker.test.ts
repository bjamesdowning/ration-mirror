import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

const authenticateMcp = vi.fn();
const checkRateLimit = vi.fn();
const createMcpHandler = vi.fn();
const logMcpOAuthVerifyFailure = vi.fn();

vi.mock("~/lib/mcp/auth", () => ({
	authenticateMcp,
	MCP_AUTH_ERRORS: new Set([
		"Missing credentials - provide OAuth Bearer token or API key",
		"Invalid API key",
	]),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit,
}));

vi.mock("agents/mcp", () => ({
	createMcpHandler,
}));

vi.mock("~/lib/oauth-telemetry.server", () => ({
	logMcpOAuthVerifyFailure,
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
	McpServer: class MockMcpServer {
		tool = vi.fn();
		resource = vi.fn();
		prompt = vi.fn();
	},
}));

vi.mock("~/lib/mcp/tools", () => ({
	registerTools: vi.fn(),
}));

const mcpWorker = await import("../../../../workers/mcp");

function makeEnv() {
	return {
		...createMockEnv(),
		BETTER_AUTH_URL: "https://ration.mayutic.com",
		MCP_OAUTH_ENABLED: "true",
	} as unknown as Cloudflare.Env;
}

describe("MCP worker fetch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		checkRateLimit.mockResolvedValue({ allowed: true });
		createMcpHandler.mockReturnValue(
			async () =>
				new Response(JSON.stringify({ jsonrpc: "2.0", result: {} }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		authenticateMcp.mockResolvedValue({
			organizationId: "org-1",
			userId: "user-1",
			apiKeyId: "key-1",
			keyName: "Test",
			keyPrefix: "rtn_test",
			scopes: ["mcp:read"],
			authMethod: "api_key",
		});
	});

	it("returns 404 for unknown paths", async () => {
		const res = await mcpWorker.default.fetch(
			new Request("https://mcp.example.com/unknown"),
			makeEnv(),
			{} as ExecutionContext,
		);
		expect(res.status).toBe(404);
	});

	it("returns CORS preflight for OPTIONS /mcp", async () => {
		const res = await mcpWorker.default.fetch(
			new Request("https://mcp.example.com/mcp", { method: "OPTIONS" }),
			makeEnv(),
			{} as ExecutionContext,
		);
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
	});

	it("returns 401 with WWW-Authenticate on auth failure", async () => {
		authenticateMcp.mockRejectedValueOnce(
			new Error("Missing credentials - provide OAuth Bearer token or API key"),
		);
		const res = await mcpWorker.default.fetch(
			new Request("https://mcp.example.com/mcp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
			}),
			makeEnv(),
			{} as ExecutionContext,
		);
		expect(res.status).toBe(401);
		expect(res.headers.get("WWW-Authenticate")).toContain("Bearer realm=");
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(logMcpOAuthVerifyFailure).toHaveBeenCalled();
	});

	it("returns 429 when HTTP rate limit is exceeded", async () => {
		checkRateLimit.mockResolvedValueOnce({
			allowed: false,
			retryAfter: 42,
		});
		const res = await mcpWorker.default.fetch(
			new Request("https://mcp.example.com/mcp", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"CF-Connecting-IP": "203.0.113.1",
				},
				body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
			}),
			makeEnv(),
			{} as ExecutionContext,
		);
		expect(res.status).toBe(429);
		expect(res.headers.get("Retry-After")).toBe("42");
		expect(authenticateMcp).not.toHaveBeenCalled();
	});

	it("returns 413 for oversized POST body", async () => {
		const res = await mcpWorker.default.fetch(
			new Request("https://mcp.example.com/mcp", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": String(4 * 1024 * 1024 + 1),
				},
				body: "{}",
			}),
			makeEnv(),
			{} as ExecutionContext,
		);
		expect(res.status).toBe(413);
	});

	it("sanitizes handler 500 JSON-RPC errors", async () => {
		createMcpHandler.mockReturnValueOnce(
			async () =>
				new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						error: { code: -32603, message: "database locked internals" },
						id: 1,
					}),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					},
				),
		);
		const res = await mcpWorker.default.fetch(
			new Request("https://mcp.example.com/mcp", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer rtn_live_test",
				},
				body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
			}),
			makeEnv(),
			{} as ExecutionContext,
		);
		expect(res.status).toBe(500);
		const body = JSON.parse(await res.text()) as {
			error: { message: string };
		};
		expect(body.error.message).toBe("Internal server error");
		expect(res.headers.get("Link")).toBeTruthy();
	});
});
