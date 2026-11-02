import { describe, expect, it } from "vitest";
import { resolveWebReviewCallback } from "../web-review-session.server";

function request() {
	return new Request("https://ration.mayutic.com/auth/review-login", {
		method: "POST",
	});
}

describe("resolveWebReviewCallback", () => {
	it("keeps same-origin paths", () => {
		expect(
			resolveWebReviewCallback("/oauth/sign-in?oauth_query=abc", request()),
		).toBe("/oauth/sign-in?oauth_query=abc");
	});

	it("keeps an absolute URL on the request origin", () => {
		expect(
			resolveWebReviewCallback(
				"https://ration.mayutic.com/hub?from=review",
				request(),
			),
		).toBe("/hub?from=review");
	});

	it("falls back to the hub for an external URL", () => {
		expect(
			resolveWebReviewCallback("https://evil.example/phish", request()),
		).toBe("/hub");
		expect(resolveWebReviewCallback("//evil.example", request())).toBe("/hub");
	});
});
