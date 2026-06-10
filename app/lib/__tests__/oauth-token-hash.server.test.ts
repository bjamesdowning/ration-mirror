import { describe, expect, it } from "vitest";
import { hashOAuthStoredToken } from "../oauth-token-hash.server";

describe("hashOAuthStoredToken", () => {
	it("returns a stable base64url SHA-256 digest", async () => {
		const first = await hashOAuthStoredToken("opaque-access-token-value");
		const second = await hashOAuthStoredToken("opaque-access-token-value");
		expect(first).toBe(second);
		expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});
