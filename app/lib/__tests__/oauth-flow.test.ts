import { describe, expect, it } from "vitest";
import {
	buildConsentScopeForSubmit,
	parseScopesFromOAuthQuery,
	resolveOAuthPostAuthPath,
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

describe("resolveOAuthPostAuthPath", () => {
	const oauthQuery = "client_id=x&scope=mcp%3Aread+offline_access";

	it("routes post_login to select-org", () => {
		const params = new URLSearchParams("post_login=true");
		expect(resolveOAuthPostAuthPath(params, oauthQuery, null)).toBe(
			"/oauth/select-org",
		);
	});

	it("routes MCP requests without active org to select-org", () => {
		const params = new URLSearchParams(
			`oauth_query=${encodeURIComponent(oauthQuery)}`,
		);
		expect(resolveOAuthPostAuthPath(params, oauthQuery, null)).toBe(
			"/oauth/select-org",
		);
	});

	it("routes to consent when org is already active", () => {
		const params = new URLSearchParams(
			`oauth_query=${encodeURIComponent(oauthQuery)}`,
		);
		expect(resolveOAuthPostAuthPath(params, oauthQuery, "org-1")).toBe(
			"/oauth/consent",
		);
	});
});
