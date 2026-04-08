/**
 * Hex-encoded HMAC-SHA256 of `userId` for Intercom identity verification.
 * @see https://www.intercom.com/help/en/articles/183-set-up-identity-verification-for-web-messenger
 */
export async function intercomIdentityHash(
	userId: string,
	secret: string,
): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(userId));
	return [...new Uint8Array(sig)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
