import { describe, expect, it } from "vitest";
import {
	appendOAuthOrgSelectedCookie,
	hasOAuthOrgSelectedCookie,
	mergeOAuthOrgSelectedIntoHeaders,
	stripOAuthOrgSelectedFromCookieHeader,
} from "../oauth-cookies.server";

describe("hasOAuthOrgSelectedCookie", () => {
	it("is false without the marker cookie", () => {
		expect(hasOAuthOrgSelectedCookie(null)).toBe(false);
		expect(hasOAuthOrgSelectedCookie("better-auth.session_token=abc")).toBe(
			false,
		);
	});

	it("is true when ration_oauth_org_selected=1 is present", () => {
		expect(
			hasOAuthOrgSelectedCookie(
				"better-auth.session_token=abc; ration_oauth_org_selected=1",
			),
		).toBe(true);
	});
});

describe("stripOAuthOrgSelectedFromCookieHeader", () => {
	it("removes only the org-selected marker", () => {
		expect(
			stripOAuthOrgSelectedFromCookieHeader(
				"better-auth.session_token=abc; ration_oauth_org_selected=1; other=1",
			),
		).toBe("better-auth.session_token=abc; other=1");
	});
});

describe("mergeOAuthOrgSelectedIntoHeaders", () => {
	it("adds org-selected to the Cookie header for internal auth calls", () => {
		const headers = new Headers({
			cookie: "better-auth.session_token=abc",
		});
		mergeOAuthOrgSelectedIntoHeaders(headers);
		expect(headers.get("cookie")).toContain("ration_oauth_org_selected=1");
	});
});

describe("appendOAuthOrgSelectedCookie", () => {
	it("appends the org-selected marker", () => {
		const headers = new Headers();
		const request = new Request("https://ration.mayutic.com/oauth/select-org");
		appendOAuthOrgSelectedCookie(headers, request);
		expect(headers.getSetCookie()[0]).toContain("ration_oauth_org_selected=1");
	});
});
