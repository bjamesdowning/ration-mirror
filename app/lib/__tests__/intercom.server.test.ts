import { describe, expect, it } from "vitest";
import { intercomIdentityHash } from "../intercom.server";

describe("intercomIdentityHash", () => {
	it("matches openssl HMAC-SHA256 hex for UTF-8 user id", async () => {
		// printf 'user123' | openssl dgst -sha256 -hmac 'testsecret' -hex
		const expected =
			"8e9c6e4d334aef1d1b18f6222aa1b72ce9d3066a7425f3c7187564e246457163";
		await expect(intercomIdentityHash("user123", "testsecret")).resolves.toBe(
			expected,
		);
	});
});
