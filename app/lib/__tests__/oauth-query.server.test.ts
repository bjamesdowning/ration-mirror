import { describe, expect, it } from "vitest";
import {
	buildConsentScopeForSubmit,
	buildOAuthPageUrl,
	collectSetCookieHeaders,
	decodeOAuthQueryFromForm,
	encodeOAuthQueryForForm,
	getSignedOAuthQuery,
	mergeSessionCookies,
	parseScopesFromSignedQuery,
} from "../oauth-query.server";

const SIGNED =
	"client_id=test&scope=mcp%3Aread&response_type=code&state=s1&redirect_uri=http%3A%2F%2Flocalhost%3A20378%2Foauth%2Fcallback&code_challenge=abc&code_challenge_method=S256&resource=https%3A%2F%2Fmcp.ration.mayutic.com%2Fmcp&exp=9999999999&sig=fake";

describe("getSignedOAuthQuery", () => {
	it("returns nested oauth_query param when present", () => {
		const url = new URL(
			`https://ration.mayutic.com/oauth/consent?oauth_query=${encodeURIComponent(SIGNED)}`,
		);
		expect(getSignedOAuthQuery(url)).toBe(SIGNED);
	});

	it("returns flat query string when sig is at top level", () => {
		const url = new URL(`https://ration.mayutic.com/oauth/consent?${SIGNED}`);
		expect(getSignedOAuthQuery(url)).toBe(SIGNED);
	});

	it("returns null when unsigned", () => {
		const url = new URL(
			"https://ration.mayutic.com/oauth/sign-in?client_id=test",
		);
		expect(getSignedOAuthQuery(url)).toBeNull();
	});
});

describe("buildOAuthPageUrl", () => {
	it("encodes signed query as single oauth_query param", () => {
		const url = buildOAuthPageUrl("/oauth/select-org", SIGNED);
		expect(url.startsWith("/oauth/select-org?oauth_query=")).toBe(true);
		expect(url).not.toContain("flow_id");
	});
});

describe("parseScopesFromSignedQuery", () => {
	it("reads scope from signed query", () => {
		expect(
			parseScopesFromSignedQuery(
				"client_id=abc&scope=mcp%3Aread+offline_access&state=xyz",
			),
		).toEqual(["mcp:read", "offline_access"]);
	});
});

describe("encodeOAuthQueryForForm", () => {
	it("round-trips scopes with plus signs (form POST safe)", () => {
		const query = "scope=mcp:read+offline_access&sig=abc";
		const encoded = encodeOAuthQueryForForm(query);
		expect(decodeOAuthQueryFromForm(encoded)).toBe(query);
	});
});

describe("collectSetCookieHeaders", () => {
	it("copies Set-Cookie lines for browser redirect forwarding", () => {
		const source = new Headers();
		source.append(
			"set-cookie",
			"better-auth.session_token=new; Path=/; HttpOnly",
		);
		const collected = collectSetCookieHeaders(source);
		expect(collected.getSetCookie()).toEqual([
			"better-auth.session_token=new; Path=/; HttpOnly",
		]);
	});
});

describe("mergeSessionCookies", () => {
	it("merges Set-Cookie into Cookie header for follow-up auth.api calls", () => {
		const request = new Request("https://ration.mayutic.com/oauth/select-org", {
			headers: { cookie: "better-auth.session_token=old" },
		});
		const authHeaders = new Headers();
		authHeaders.append(
			"set-cookie",
			"better-auth.session_token=new; Path=/; HttpOnly",
		);
		const merged = mergeSessionCookies(request, { headers: authHeaders });
		expect(merged.get("cookie")).toContain("better-auth.session_token=new");
		expect(merged.get("cookie")).not.toContain("=old");
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
