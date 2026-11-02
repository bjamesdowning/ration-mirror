import { describe, expect, it } from "vitest";
import { shouldShowWebReviewPassword } from "../review-login-gate";

const reviewEmail = "app-review@mayutic.com";

describe("shouldShowWebReviewPassword", () => {
	it("shows the password field only for the review email on Sign In", () => {
		expect(
			shouldShowWebReviewPassword({
				mode: "signIn",
				email: "  App-Review@Mayutic.com ",
				reviewEmail,
				appReviewLogin: true,
			}),
		).toBe(true);
	});

	it("hides the field when the flag is off", () => {
		expect(
			shouldShowWebReviewPassword({
				mode: "signIn",
				email: reviewEmail,
				reviewEmail,
				appReviewLogin: false,
			}),
		).toBe(false);
	});

	it("hides the field when the review email was not published", () => {
		expect(
			shouldShowWebReviewPassword({
				mode: "signIn",
				email: reviewEmail,
				reviewEmail: null,
				appReviewLogin: true,
			}),
		).toBe(false);
	});

	it("keeps every other email on the magic link", () => {
		expect(
			shouldShowWebReviewPassword({
				mode: "signIn",
				email: "someone@example.com",
				reviewEmail,
				appReviewLogin: true,
			}),
		).toBe(false);
	});

	it("never shows the field on Create Account", () => {
		expect(
			shouldShowWebReviewPassword({
				mode: "signUp",
				email: reviewEmail,
				reviewEmail,
				appReviewLogin: true,
			}),
		).toBe(false);
	});
});
