import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOL_TIMEOUT_MS } from "../constants";
import { err, ok } from "../envelope";
import { type McpToolsEnv, runTool } from "../tool-runtime";

describe("runTool timeout", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns structured timeout when handler exceeds MCP_TOOL_TIMEOUT_MS", async () => {
		const env = {
			__mcp: {
				organizationId: "org-1",
				userId: "user-1",
				scopes: ["mcp:read"],
				authMethod: "api_key",
				apiKeyId: "key-1",
				keyName: "test",
				keyPrefix: "rk_",
				preClaim: false,
			},
			RATION_KV: {
				get: vi.fn(),
				put: vi.fn(),
			},
		} as unknown as McpToolsEnv;

		const pending = runTool(
			env,
			{
				name: "slow_tool",
				scopes: ["mcp:read"],
				rateLimitCategory: null,
				audit: false,
				handler: async () => {
					await new Promise((resolve) =>
						setTimeout(resolve, MCP_TOOL_TIMEOUT_MS + 5_000),
					);
					return ok("slow_tool", { done: true });
				},
			},
			{},
		);

		await vi.advanceTimersByTimeAsync(MCP_TOOL_TIMEOUT_MS + 1);
		const envelope = await pending;
		expect(envelope.ok).toBe(false);
		if (!envelope.ok) {
			expect(envelope.error.code).toBe("timeout");
			expect(envelope.error.recoveryHint).toBeTruthy();
		}
	});

	it("returns handler result when it finishes before timeout", async () => {
		const env = {
			__mcp: {
				organizationId: "org-1",
				userId: "user-1",
				scopes: ["mcp:read"],
				authMethod: "api_key",
				apiKeyId: "key-1",
				keyName: "test",
				keyPrefix: "rk_",
				preClaim: false,
			},
			RATION_KV: {
				get: vi.fn(),
				put: vi.fn(),
			},
		} as unknown as McpToolsEnv;

		const pending = runTool(
			env,
			{
				name: "fast_tool",
				scopes: ["mcp:read"],
				rateLimitCategory: null,
				audit: false,
				handler: async () => ok("fast_tool", { value: 1 }),
			},
			{},
		);

		await vi.advanceTimersByTimeAsync(10);
		const envelope = await pending;
		expect(envelope).toEqual(ok("fast_tool", { value: 1 }));
	});
});

describe("timeout error helper", () => {
	it("builds timeout envelope", () => {
		const envelope = err("x", "timeout", "timed out", {
			recoveryHint: "retry",
		});
		expect(envelope.ok).toBe(false);
		if (!envelope.ok) expect(envelope.error.code).toBe("timeout");
	});
});
