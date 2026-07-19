import { describe, expect, it } from "vitest";
import {
	MobileActivateOrgSchema,
	MobileMagicLinkSchema,
	MobileReviewLoginSchema,
	MobileTokenRequestSchema,
} from "~/lib/schemas/mobile/auth";

const VALID_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const VALID_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

describe("MobileMagicLinkSchema", () => {
	it("accepts valid email with a PKCE challenge", () => {
		const result = MobileMagicLinkSchema.safeParse({
			email: "crew@ration.app",
			codeChallenge: VALID_CHALLENGE,
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid email", () => {
		const result = MobileMagicLinkSchema.safeParse({
			email: "not-an-email",
			codeChallenge: VALID_CHALLENGE,
		});
		expect(result.success).toBe(false);
	});

	it("rejects a missing PKCE challenge", () => {
		const result = MobileMagicLinkSchema.safeParse({
			email: "crew@ration.app",
		});
		expect(result.success).toBe(false);
	});

	it("rejects a malformed PKCE challenge", () => {
		const result = MobileMagicLinkSchema.safeParse({
			email: "crew@ration.app",
			codeChallenge: "too short",
		});
		expect(result.success).toBe(false);
	});
});

describe("MobileTokenRequestSchema", () => {
	it("accepts authorization_code grant with a verifier", () => {
		const result = MobileTokenRequestSchema.safeParse({
			grantType: "authorization_code",
			code: "abc123",
			codeVerifier: VALID_VERIFIER,
		});
		expect(result.success).toBe(true);
	});

	it("rejects authorization_code grant without a verifier", () => {
		const result = MobileTokenRequestSchema.safeParse({
			grantType: "authorization_code",
			code: "abc123",
		});
		expect(result.success).toBe(false);
	});

	it("accepts refresh_token grant", () => {
		const result = MobileTokenRequestSchema.safeParse({
			grantType: "refresh_token",
			refreshToken: "refresh-xyz",
		});
		expect(result.success).toBe(true);
	});
});

describe("MobileActivateOrgSchema", () => {
	it("requires organizationId", () => {
		const result = MobileActivateOrgSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe("MobileReviewLoginSchema", () => {
	it("accepts email, password, and tosAccepted", () => {
		const result = MobileReviewLoginSchema.safeParse({
			email: "app-review@mayutic.com",
			password: "ReviewPass!",
			tosAccepted: true,
		});
		expect(result.success).toBe(true);
	});

	it("rejects missing tosAccepted", () => {
		const result = MobileReviewLoginSchema.safeParse({
			email: "app-review@mayutic.com",
			password: "ReviewPass!",
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty password", () => {
		const result = MobileReviewLoginSchema.safeParse({
			email: "app-review@mayutic.com",
			password: "",
			tosAccepted: true,
		});
		expect(result.success).toBe(false);
	});
});
