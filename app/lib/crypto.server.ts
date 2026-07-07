/**
 * Shared SHA-256 helpers for content-addressed cache keys and digests.
 */

/**
 * SHA-256 hex digest of `input`, optionally truncated.
 * Uses Web Crypto when available; falls back to a non-cryptographic hash in test envs.
 */
export async function sha256Hex(input: string, truncate = 32): Promise<string> {
	if (typeof crypto !== "undefined" && crypto.subtle) {
		const buf = new TextEncoder().encode(input);
		const digest = await crypto.subtle.digest("SHA-256", buf);
		const hex = Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		return truncate > 0 ? hex.slice(0, truncate) : hex;
	}
	// Fallback (test environments without WebCrypto): non-cryptographic.
	let h = 0;
	for (let i = 0; i < input.length; i++) {
		h = (h * 31 + input.charCodeAt(i)) | 0;
	}
	const fallback = `f${(h >>> 0).toString(16)}`;
	return truncate > 0 ? fallback.slice(0, truncate) : fallback;
}
