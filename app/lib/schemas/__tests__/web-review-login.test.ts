import { describe, expect, it } from "vitest";
import { WebReviewLoginSchema } from "../web-review-login";

describe("WebReviewLoginSchema", () => {
	it("accepts email, password, and an optional callback", () => {
		const parsed = WebReviewLoginSchema.parse({
			email: "  app-review@mayutic.com ",
			password: "secret",
			callbackURL: "/oauth/sign-in?oauth_query=abc",
		});
		expect(parsed.email).toBe("app-review@mayutic.com");
		expect(parsed.password).toBe("secret");
		expect(parsed.callbackURL).toBe("/oauth/sign-in?oauth_query=abc");
	});

	it("rejects a missing password", () => {
		const result = WebReviewLoginSchema.safeParse({
			email: "app-review@mayutic.com",
			password: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects a non-email", () => {
		const result = WebReviewLoginSchema.safeParse({
			email: "not-an-email",
			password: "secret",
		});
		expect(result.success).toBe(false);
	});
});
