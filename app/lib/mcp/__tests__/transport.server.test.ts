import { describe, expect, it } from "vitest";
import {
	enforceMcpRequestLimits,
	MCP_MAX_JSONRPC_BATCH,
	readBoundedBodyText,
	resolveMcpClientIp,
} from "../transport.server";

function postRequest(
	body: string,
	headers: Record<string, string> = {},
): Request {
	return new Request("https://mcp.example.com/mcp", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body,
	});
}

describe("resolveMcpClientIp", () => {
	it("uses CF-Connecting-IP when present", () => {
		const req = new Request("https://mcp.example.com/mcp", {
			headers: {
				"CF-Connecting-IP": "203.0.113.10",
				"X-Forwarded-For": "198.51.100.1",
			},
		});
		expect(resolveMcpClientIp(req)).toBe("203.0.113.10");
	});

	it("returns unknown when CF-Connecting-IP is absent", () => {
		const req = new Request("https://mcp.example.com/mcp", {
			headers: { "X-Forwarded-For": "198.51.100.1" },
		});
		expect(resolveMcpClientIp(req)).toBe("unknown");
	});
});

describe("enforceMcpRequestLimits", () => {
	it("allows GET without reading body", async () => {
		const result = await enforceMcpRequestLimits(
			new Request("https://mcp.example.com/mcp", { method: "GET" }),
		);
		expect(result).toBeNull();
	});

	it("rejects oversized Content-Length before reading body", async () => {
		const result = await enforceMcpRequestLimits(
			postRequest("{}", {
				"Content-Length": String(4 * 1024 * 1024 + 1),
			}),
		);
		expect(result?.status).toBe(413);
	});

	it("rejects body over cap when Content-Length is absent", async () => {
		const result = await readBoundedBodyText(postRequest("x".repeat(101)), 100);
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(413);
	});

	it("rejects JSON-RPC batch over limit without Content-Length", async () => {
		const batch = Array.from({ length: MCP_MAX_JSONRPC_BATCH + 1 }, () => ({
			jsonrpc: "2.0",
			method: "ping",
			id: 1,
		}));
		const result = await enforceMcpRequestLimits(
			postRequest(JSON.stringify(batch)),
		);
		expect(result?.status).toBe(400);
		const json = (await result?.json()) as { error: string };
		expect(json.error).toContain(String(MCP_MAX_JSONRPC_BATCH));
	});

	it("allows small valid JSON-RPC body without Content-Length", async () => {
		const result = await enforceMcpRequestLimits(
			postRequest(JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 })),
		);
		expect(result).toBeNull();
	});

	it("leaves original request body readable for the handler", async () => {
		const payload = JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 });
		const request = postRequest(payload);
		await enforceMcpRequestLimits(request);
		expect(await request.text()).toBe(payload);
	});
});
