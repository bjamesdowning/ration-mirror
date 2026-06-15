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
	};
}

describe("MCP_SCOPES", () => {
	it("lists mcp:delegate for provider vocabulary", () => {
		expect(MCP_SCOPES).toContain("mcp:delegate");
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
		expect(hasScope(ctx(["mcp"]), "mcp:delegate")).toBe(true);
	});

	it("returns false for mcp:delegate without explicit or legacy grant", () => {
		expect(
			hasScope(ctx(["mcp:read", "mcp:inventory:write"]), "mcp:delegate"),
		).toBe(false);
	});
});
