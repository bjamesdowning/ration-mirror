import { describe, expect, it } from "vitest";
import type { McpToolContext } from "../auth";
import { hasScope, MCP_SCOPES, McpScopeError, requireScope } from "../scopes";

function ctx(scopes: string[]): McpToolContext {
	return {
		organizationId: "org-1",
		userId: "user-1",
		scopes,
		authMethod: "api_key",
		apiKeyId: "key-1",
		keyName: "Test",
		keyPrefix: "rtn_test",
		preClaim: false,
	};
}

describe("MCP_SCOPES", () => {
	it("does not expose delegated actor-token scopes", () => {
		expect(MCP_SCOPES).not.toContain("mcp:delegate");
	});
});

describe("requireScope", () => {
	it("allows legacy mcp scope for any narrow requirement", () => {
		expect(() =>
			requireScope(ctx(["mcp"]), ["mcp:galley:write"]),
		).not.toThrow();
	});

	it("throws McpScopeError when a required scope is missing", () => {
		expect(() =>
			requireScope(ctx(["mcp:read"]), ["mcp:inventory:write"]),
		).toThrow(McpScopeError);
		try {
			requireScope(ctx(["mcp:read"]), ["mcp:inventory:write"]);
		} catch (e) {
			expect(e).toBeInstanceOf(McpScopeError);
			expect((e as McpScopeError).required).toBe("mcp:inventory:write");
		}
	});

	it("requires every scope in a multi-scope tool list", () => {
		expect(() =>
			requireScope(ctx(["mcp:galley:write"]), [
				"mcp:galley:write",
				"mcp:inventory:write",
			]),
		).toThrow(McpScopeError);
		expect(() =>
			requireScope(ctx(["mcp:galley:write", "mcp:inventory:write"]), [
				"mcp:galley:write",
				"mcp:inventory:write",
			]),
		).not.toThrow();
	});
});

describe("hasScope", () => {
	it("returns true for legacy mcp on any narrow scope check", () => {
		expect(hasScope(ctx(["mcp"]), "mcp:read")).toBe(true);
	});
});
