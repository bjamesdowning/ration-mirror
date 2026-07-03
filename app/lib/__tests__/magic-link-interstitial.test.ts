import { describe, expect, it } from "vitest";
import {
	buildMagicLinkVerifyUrl,
	magicLinkVerifyToContinueUrl,
} from "~/lib/magic-link-interstitial.server";

const origin = "https://ration.mayutic.com";
const verifyUrl =
	"https://ration.mayutic.com/api/auth/magic-link/verify?token=abc123&callbackURL=https%3A%2F%2Fration.mayutic.com%2Fhub";

describe("magicLinkVerifyToContinueUrl", () => {
	it("maps verify params onto the continue page", () => {
		const continueUrl = magicLinkVerifyToContinueUrl(verifyUrl, origin);
		expect(continueUrl).toBe(
			"https://ration.mayutic.com/auth/magic-link/continue?token=abc123&callbackURL=https%3A%2F%2Fration.mayutic.com%2Fhub",
		);
	});
});

describe("buildMagicLinkVerifyUrl", () => {
	it("rebuilds the Better Auth verify URL", () => {
		const params = new URLSearchParams({
			token: "abc123",
			callbackURL: "https://ration.mayutic.com/hub",
		});
		expect(buildMagicLinkVerifyUrl(origin, params)).toBe(verifyUrl);
	});

	it("returns null without a token", () => {
		expect(buildMagicLinkVerifyUrl(origin, new URLSearchParams())).toBeNull();
	});
});
