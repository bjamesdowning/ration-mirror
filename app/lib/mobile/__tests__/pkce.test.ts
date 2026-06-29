import { describe, expect, it } from "vitest";
import { computeS256Challenge, verifyPkceChallenge } from "~/lib/mobile/pkce";

// RFC 7636 Appendix B reference vector.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("computeS256Challenge", () => {
	it("matches the RFC 7636 reference vector", async () => {
		expect(await computeS256Challenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
	});

	it("produces url-safe base64 without padding", async () => {
		const challenge = await computeS256Challenge("a".repeat(64));
		expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
		expect(challenge).not.toContain("=");
	});
});

describe("verifyPkceChallenge", () => {
	it("accepts a matching verifier/challenge pair", async () => {
		expect(await verifyPkceChallenge(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
	});

	it("rejects a mismatched verifier", async () => {
		const wrong = `${RFC_VERIFIER.slice(0, -1)}X`;
		expect(await verifyPkceChallenge(wrong, RFC_CHALLENGE)).toBe(false);
	});

	it("rejects a verifier that is too short", async () => {
		expect(await verifyPkceChallenge("tooshort", RFC_CHALLENGE)).toBe(false);
	});

	it("rejects a malformed challenge", async () => {
		expect(
			await verifyPkceChallenge(RFC_VERIFIER, "not valid base64url!"),
		).toBe(false);
	});
});
