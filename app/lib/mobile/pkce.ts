/**
 * PKCE (RFC 7636) helpers for the mobile magic-link → authorization-code flow.
 *
 * The iOS client generates a high-entropy `code_verifier`, sends only the
 * S256 `code_challenge` when requesting the magic link, and proves possession
 * of the verifier at token-exchange time. This binds the one-time auth code to
 * the originating app, so a malicious app that hijacks the `ration://` custom
 * URL scheme cannot redeem an intercepted code.
 *
 * Edge-compatible: uses Web Crypto (`crypto.subtle`) and `btoa` only.
 */

/** Allowed verifier/challenge length per RFC 7636 §4.1 (43–128 chars). */
export const PKCE_MIN_LENGTH = 43;
export const PKCE_MAX_LENGTH = 128;

/** base64url "unreserved" character set (RFC 7636: A-Z a-z 0-9 - . _ ~). */
export const PKCE_CHALLENGE_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Computes the S256 challenge: base64url(SHA-256(verifier)). */
export async function computeS256Challenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Verifies a `code_verifier` against a stored S256 `code_challenge` using a
 * constant-time comparison. Returns false on any malformed input rather than
 * throwing, so callers can map to a generic 400.
 */
export async function verifyPkceChallenge(
	verifier: string,
	challenge: string,
): Promise<boolean> {
	if (
		verifier.length < PKCE_MIN_LENGTH ||
		verifier.length > PKCE_MAX_LENGTH ||
		!PKCE_CHALLENGE_REGEX.test(challenge)
	) {
		return false;
	}
	const computed = await computeS256Challenge(verifier);
	return timingSafeEqual(computed, challenge);
}

/** Length-independent constant-time string compare. */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}
