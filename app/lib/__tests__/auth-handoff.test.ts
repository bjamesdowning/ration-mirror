import { describe, expect, it } from "vitest";
import {
	MOBILE_AUTH_CODE_REGEX,
	mobileAuthHandoffLinks,
	parseMobileAuthCodeParam,
} from "../mobile/auth-handoff";

describe("mobileAuthHandoffLinks", () => {
	const code = "550e8400-e29b-41d4-a716-446655440000";

	it("builds universal and custom-scheme links", () => {
		const links = mobileAuthHandoffLinks("https://ration.mayutic.com", code);
		expect(links.universalLink).toBe(
			`https://ration.mayutic.com/auth/mobile-callback/open?code=${encodeURIComponent(code)}`,
		);
		expect(links.customSchemeLink).toBe(
			`ration://auth/callback?code=${encodeURIComponent(code)}`,
		);
	});

	it("strips trailing slash from base URL", () => {
		const links = mobileAuthHandoffLinks("https://ration.mayutic.com/", code);
		expect(links.universalLink).toMatch(
			/^https:\/\/ration\.mayutic\.com\/auth\/mobile-callback\/open/,
		);
	});
});

describe("parseMobileAuthCodeParam", () => {
	it("accepts a UUID", () => {
		const id = "550e8400-e29b-41d4-a716-446655440000";
		expect(parseMobileAuthCodeParam(id)).toBe(id);
		expect(MOBILE_AUTH_CODE_REGEX.test(id)).toBe(true);
	});

	it("rejects invalid codes", () => {
		expect(parseMobileAuthCodeParam(null)).toBeNull();
		expect(parseMobileAuthCodeParam("not-a-uuid")).toBeNull();
		expect(parseMobileAuthCodeParam("")).toBeNull();
	});
});
