import { describe, expect, it } from "vitest";
import { OAUTH_ORG_SELECTED_COOKIE } from "../oauth.constants";
import {
	hasOAuthOrgSelectedCookie,
	mergeOAuthOrgSelectedIntoHeaders,
	stripOAuthOrgSelectedFromCookieHeader,
} from "../oauth-cookies.server";

describe("oauth org-selected cookie", () => {
	it("detects the org-selected marker in a cookie header", () => {
		expect(
			hasOAuthOrgSelectedCookie(
				`session=abc; ${OAUTH_ORG_SELECTED_COOKIE}=1; other=1`,
			),
		).toBe(true);
		expect(hasOAuthOrgSelectedCookie("session=abc")).toBe(false);
	});

	it("strips the org-selected marker for fresh authorize requests", () => {
		expect(
			stripOAuthOrgSelectedFromCookieHeader(
				`session=abc; ${OAUTH_ORG_SELECTED_COOKIE}=1; other=1`,
			),
		).toBe("session=abc; other=1");
	});

	it("merges org-selected into headers for internal continue calls", () => {
		const headers = new Headers({ cookie: "session=abc" });
		mergeOAuthOrgSelectedIntoHeaders(headers);
		expect(headers.get("cookie")).toBe(
			`session=abc; ${OAUTH_ORG_SELECTED_COOKIE}=1`,
		);
	});
});
