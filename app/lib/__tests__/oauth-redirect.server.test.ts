import { describe, expect, it } from "vitest";
import fixtures from "../../test/fixtures/oauth/better-auth-redirects.json";
import {
	getAuthRedirectUrl,
	getSafeAuthRedirectUrl,
	isAllowedOAuthRedirectUrl,
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

	it("allows root-relative same-origin paths (Better Auth page redirects)", () => {
		expect(isAllowedOAuthRedirectUrl("/oauth/consent?oauth_query=abc")).toBe(
			true,
		);
		expect(isAllowedOAuthRedirectUrl("/oauth/select-org")).toBe(true);
	});

	it("rejects protocol-relative URLs to prevent open redirects", () => {
		expect(isAllowedOAuthRedirectUrl("//evil.com/oauth/consent")).toBe(false);
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

	it("returns Better Auth redirect URLs verbatim", () => {
		const url = getSafeAuthRedirectUrl(fixtures.oauth2Continue_success);
		expect(url).toContain("/oauth/consent");
	});
});
