import { hashApiKey } from "../api-key.server";

/** KV key for hashed OTP + attempt counter during claim ceremony. */
export function claimOtpKvKey(registrationId: string): string {
	return `agent:claim:otp:${registrationId}`;
}

/** KV key for OTP attempt count (separate from hash for clarity). */
export function claimOtpAttemptsKvKey(registrationId: string): string {
	return `agent:claim:otp_attempts:${registrationId}`;
}

/** Generate a URL-safe claim token (32 hex chars). */
export function generateClaimToken(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex digest for claim tokens and OTPs at rest. */
export async function hashToken(raw: string): Promise<string> {
	return hashApiKey(raw);
}

/** 6-digit numeric OTP for email verification. */
export function generateOtp(): string {
	const n = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
	return String(100_000 + (n % 900_000));
}
