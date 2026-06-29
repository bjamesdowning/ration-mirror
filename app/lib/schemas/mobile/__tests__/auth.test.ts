import { describe, expect, it } from "vitest";
import {
	MobileActivateOrgSchema,
	MobileMagicLinkSchema,
	MobileTokenRequestSchema,
} from "~/lib/schemas/mobile/auth";

describe("MobileMagicLinkSchema", () => {
	it("accepts valid email", () => {
		const result = MobileMagicLinkSchema.safeParse({
			email: "crew@ration.app",
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid email", () => {
		const result = MobileMagicLinkSchema.safeParse({ email: "not-an-email" });
		expect(result.success).toBe(false);
	});
});

describe("MobileTokenRequestSchema", () => {
	it("accepts authorization_code grant", () => {
		const result = MobileTokenRequestSchema.safeParse({
			grantType: "authorization_code",
			code: "abc123",
		});
		expect(result.success).toBe(true);
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
