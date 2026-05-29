import { describe, expect, it } from "vitest";
import {
	buildConsentScopeForSubmit,
	parseScopesFromOAuthQuery,
} from "../oauth-flow";

describe("parseScopesFromOAuthQuery", () => {
	it("reads scope from oauth_query", () => {
		expect(
			parseScopesFromOAuthQuery(
				"client_id=abc&scope=mcp%3Aread+offline_access&state=xyz",
			),
		).toEqual(["mcp:read", "offline_access"]);
	});
});

describe("buildConsentScopeForSubmit", () => {
	it("preserves offline_access from the original request", () => {
		const oauthQuery =
			"client_id=abc&scope=mcp%3Aread+offline_access&response_type=code";
		expect(
			buildConsentScopeForSubmit(["mcp:galley:write"], oauthQuery),
		).toEqual("mcp:galley:write offline_access");
	});

	it("falls back to requested MCP scopes when none selected", () => {
		const oauthQuery = "scope=mcp%3Aread+mcp%3Asupply%3Awrite+offline_access";
		expect(buildConsentScopeForSubmit([], oauthQuery)).toEqual(
			"mcp:read mcp:supply:write offline_access",
		);
	});
});
