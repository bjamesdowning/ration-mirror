import { describe, expect, it } from "vitest";
import { buildOAuthAuthorizeResumeUrl } from "../oauth-auth-http.server";
import { getOAuthCorrelationId } from "../oauth-correlation.server";
import { buildOAuthPageUrl, getSignedOAuthQuery } from "../oauth-query.server";
import {
	classifyOAuthInternalRedirect,
	getSafeAuthRedirectUrl,
} from "../oauth-redirect.server";

describe("OAuth flow helpers", () => {
	it("preserves signed oauth_query when building page URLs", () => {
		const signed = "client_id=cursor&scope=mcp%3Aread&sig=abc&exp=999";
		expect(buildOAuthPageUrl("/oauth/sign-in", signed)).toBe(
			"/oauth/sign-in?oauth_query=client_id%3Dcursor%26scope%3Dmcp%253Aread%26sig%3Dabc%26exp%3D999",
		);
	});

	it("extracts nested and flat signed oauth_query params", () => {
		const nested = new URL(
			"https://ration.mayutic.com/oauth/consent?oauth_query=client_id%3Dc1%26sig%3Ds",
		);
		expect(getSignedOAuthQuery(nested)).toBe("client_id=c1&sig=s");

		const flat = new URL(
			"https://ration.mayutic.com/oauth/select-org?client_id=c1&sig=s",
		);
		expect(getSignedOAuthQuery(flat)).toBe("client_id=c1&sig=s");
	});

	it("builds a native authorize resume URL on the Better Auth API path", () => {
		const request = new Request("https://ration.mayutic.com/oauth/sign-in");
		const signed = "client_id=cursor&scope=mcp%3Aread&sig=abc";

		expect(buildOAuthAuthorizeResumeUrl(request, signed)).toBe(
			"https://ration.mayutic.com/api/auth/oauth2/authorize?client_id=cursor&scope=mcp%3Aread&sig=abc",
		);
	});

	it("accepts Better Auth redirect payloads for continue/consent", () => {
		expect(
			getSafeAuthRedirectUrl({
				redirect: true,
				url: "/oauth/consent?oauth_query=signed",
			}),
		).toBe("/oauth/consent?oauth_query=signed");

		expect(
			getSafeAuthRedirectUrl({
				redirect_uri: "cursor://anysphere.cursor-mcp/oauth/callback?code=abc",
			}),
		).toBe("cursor://anysphere.cursor-mcp/oauth/callback?code=abc");
	});

	it("rejects unsafe redirect targets", () => {
		expect(getSafeAuthRedirectUrl({ url: "//evil.example/phish" })).toBeNull();
		expect(getSafeAuthRedirectUrl({ url: "javascript:alert(1)" })).toBeNull();
	});

	it("classifies internal OAuth redirect targets for telemetry", () => {
		expect(
			classifyOAuthInternalRedirect("/oauth/consent?oauth_query=signed"),
		).toBe("consent");
		expect(
			classifyOAuthInternalRedirect("/oauth/select-org?oauth_query=signed"),
		).toBe("select_org");
		expect(classifyOAuthInternalRedirect("cursor://cb?code=abc")).toBe(
			"client_callback",
		);
	});

	it("reuses or mints a correlation id without logging secrets", () => {
		const request = new Request("https://ration.mayutic.com/oauth/sign-in", {
			headers: { cookie: "ration_oauth_cid=flow-123" },
		});
		expect(getOAuthCorrelationId(request)).toBe("flow-123");

		const fresh = new Request("https://ration.mayutic.com/oauth/sign-in");
		expect(getOAuthCorrelationId(fresh)).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
	});
});
