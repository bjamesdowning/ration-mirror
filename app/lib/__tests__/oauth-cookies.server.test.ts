import { describe, expect, it } from "vitest";
import {
	appendOAuthOrgSelectedCookie,
	hasOAuthOrgSelectedCookie,
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

describe("appendOAuthOrgSelectedCookie", () => {
	it("appends the org-selected marker", () => {
		const headers = new Headers();
		const request = new Request("https://ration.mayutic.com/oauth/select-org");
		appendOAuthOrgSelectedCookie(headers, request);
		expect(headers.getSetCookie()[0]).toContain("ration_oauth_org_selected=1");
	});
});
