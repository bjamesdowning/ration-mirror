import { describe, expect, it } from "vitest";
import {
	MCP_CORS_HEADERS,
	sanitizeMcpHandlerResponse,
	withMcpCors,
} from "../worker-response.server";

describe("sanitizeMcpHandlerResponse", () => {
	it("passes through sub-500 responses unchanged", async () => {
		const res = new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
		const out = await sanitizeMcpHandlerResponse(res);
		expect(out.status).toBe(200);
		expect(await out.text()).toBe(JSON.stringify({ ok: true }));
	});

	it("replaces JSON-RPC error message on 500", async () => {
		const res = new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32603, message: "SQLITE_BUSY secret details" },
				id: 1,
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
		const out = await sanitizeMcpHandlerResponse(res);
		const body = JSON.parse(await out.text()) as {
			error: { message: string };
		};
		expect(body.error.message).toBe("Internal server error");
		expect(body.error.message).not.toContain("SQLITE");
	});

	it("returns generic JSON-RPC error when 500 body is not parseable", async () => {
		const res = new Response("not json", {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
		const out = await sanitizeMcpHandlerResponse(res);
		const body = JSON.parse(await out.text()) as {
			error: { message: string; code: number };
		};
		expect(body.error.message).toBe("Internal server error");
		expect(body.error.code).toBe(-32603);
	});
});

describe("withMcpCors", () => {
	it("adds wildcard CORS headers", () => {
		const out = withMcpCors(new Response("ok", { status: 200 }));
		for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
			expect(out.headers.get(key)).toBe(value);
		}
	});
});
