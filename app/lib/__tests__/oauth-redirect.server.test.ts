import { describe, expect, it } from "vitest";
import fixtures from "../../test/fixtures/oauth/better-auth-redirects.json";
import {
	getAuthRedirectUrl,
	getSafeAuthRedirectUrl,
	isAllowedOAuthRedirectUrl,
	isOAuthConsentRedirect,
	isOAuthSelectOrgRedirect,
	resolveOAuthFlowRedirectUrl,
} from "../oauth-redirect.server";

describe("getAuthRedirectUrl", () => {
	it("reads redirect.url from oauth2Continue fixture", () => {
		expect(getAuthRedirectUrl(fixtures.oauth2Continue_success)).toContain(
			"/oauth/consent",
		);
	});

	it("reads redirect_uri from alternate fixture", () => {
		expect(getAuthRedirectUrl(fixtures.oauth2Continue_redirect_uri)).toContain(
			"/oauth/consent",
		);
	});

	it("reads client callback from consent fixture", () => {
		expect(getAuthRedirectUrl(fixtures.oauth2Consent_success)).toMatch(
			/^cursor:/,
		);
	});
});

describe("isAllowedOAuthRedirectUrl", () => {
	it("allows https app and cursor callbacks", () => {
		expect(
			isAllowedOAuthRedirectUrl("https://ration.mayutic.com/oauth/consent"),
		).toBe(true);
		expect(
			isAllowedOAuthRedirectUrl(
				"cursor://anysphere.cursor-mcp/oauth/callback?code=x",
			),
		).toBe(true);
	});

	it("rejects javascript URLs", () => {
		expect(isAllowedOAuthRedirectUrl("javascript:alert(1)")).toBe(false);
	});
});

describe("getSafeAuthRedirectUrl", () => {
	it("returns null for disallowed schemes", () => {
		expect(getSafeAuthRedirectUrl({ redirect_uri: "javascript:void(0)" })).toBe(
			null,
		);
	});
});

describe("isOAuthSelectOrgRedirect", () => {
	it("detects select-org post-login loops", () => {
		expect(
			isOAuthSelectOrgRedirect(
				"https://ration.mayutic.com/oauth/select-org?flow_id=abc",
			),
		).toBe(true);
		expect(
			isOAuthSelectOrgRedirect(
				"https://ration.mayutic.com/oauth/consent?flow_id=abc",
			),
		).toBe(false);
	});
});

describe("resolveOAuthFlowRedirectUrl", () => {
	const flowId = "00000000-0000-4000-8000-000000000001";
	const oauthQuery =
		"client_id=test&scope=mcp%3Aread&response_type=code&state=s1";

	it("merges flow_id into Better Auth consent URLs", () => {
		const resolved = resolveOAuthFlowRedirectUrl(
			"https://ration.mayutic.com/oauth/consent?oauth_query=client_id%3Dtest",
			flowId,
			oauthQuery,
		);
		expect(resolved).toContain("flow_id=");
		expect(resolved).toContain(flowId);
	});

	it("replaces select-org redirects with orchestrator consent URL", () => {
		const resolved = resolveOAuthFlowRedirectUrl(
			"https://ration.mayutic.com/oauth/select-org",
			flowId,
			oauthQuery,
		);
		expect(resolved).toContain("/oauth/consent");
		expect(resolved).toContain("flow_id=");
	});
});
