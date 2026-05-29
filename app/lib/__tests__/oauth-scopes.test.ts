import { describe, expect, it } from "vitest";
import {
	formatOAuthScopesDisplay,
	normalizeOAuthScopes,
} from "../oauth-scopes";

describe("normalizeOAuthScopes", () => {
	it("returns arrays of strings as-is (flattened)", () => {
		expect(normalizeOAuthScopes(["mcp:read", "offline_access"])).toEqual([
			"mcp:read",
			"offline_access",
		]);
	});

	it("splits space-separated scope strings", () => {
		expect(normalizeOAuthScopes("mcp:read mcp:galley:write")).toEqual([
			"mcp:read",
			"mcp:galley:write",
		]);
	});

	it("parses JSON array strings", () => {
		expect(normalizeOAuthScopes('["mcp:read","mcp:supply:write"]')).toEqual([
			"mcp:read",
			"mcp:supply:write",
		]);
	});

	it("returns empty for nullish and invalid values", () => {
		expect(normalizeOAuthScopes(null)).toEqual([]);
		expect(normalizeOAuthScopes(undefined)).toEqual([]);
		expect(normalizeOAuthScopes(42)).toEqual([]);
		expect(normalizeOAuthScopes("")).toEqual([]);
	});
});

describe("formatOAuthScopesDisplay", () => {
	it("formats normalized scopes for display", () => {
		expect(formatOAuthScopesDisplay("mcp:read mcp:galley:write")).toBe(
			"mcp:read, mcp:galley:write",
		);
	});

	it("shows em dash when no scopes", () => {
		expect(formatOAuthScopesDisplay(null)).toBe("—");
	});
});
