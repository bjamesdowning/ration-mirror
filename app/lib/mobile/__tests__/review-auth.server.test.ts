import { describe, expect, it } from "vitest";
import {
	readReviewLoginSecrets,
	timingSafeEqualString,
} from "~/lib/mobile/review-auth.server";
import { createMockEnv } from "~/test/helpers/mock-env";

describe("timingSafeEqualString", () => {
	it("returns true for equal strings", () => {
		expect(timingSafeEqualString("abc", "abc")).toBe(true);
	});

	it("returns false for unequal strings of equal length", () => {
		expect(timingSafeEqualString("abc", "abd")).toBe(false);
	});

	it("returns false for unequal lengths", () => {
		expect(timingSafeEqualString("ab", "abc")).toBe(false);
	});
});

describe("readReviewLoginSecrets", () => {
	it("returns null when any secret is missing", () => {
		expect(readReviewLoginSecrets(createMockEnv())).toBeNull();
		expect(
			readReviewLoginSecrets({
				...createMockEnv(),
				APP_REVIEW_DEMO_EMAIL: "app-review@mayutic.com",
				APP_REVIEW_DEMO_PASSWORD: "pw",
			} as never),
		).toBeNull();
	});

	it("normalizes email and returns secrets when configured", () => {
		const secrets = readReviewLoginSecrets({
			...createMockEnv(),
			APP_REVIEW_DEMO_EMAIL: "  App-Review@Mayutic.com ",
			APP_REVIEW_DEMO_PASSWORD: "ReviewPass!",
			APP_REVIEW_DEMO_USER_ID: "user-1",
		} as never);
		expect(secrets).toEqual({
			email: "app-review@mayutic.com",
			password: "ReviewPass!",
			userId: "user-1",
		});
	});
});
