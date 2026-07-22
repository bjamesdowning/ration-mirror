import { CURRENT_TOS_VERSION } from "~/lib/tos.constants";

/** Matches magic-link expiry so Sign Up consent cannot outlive the link. */
export const TOS_SIGNUP_INTENT_TTL_SEC = 300;

export const TOS_SIGNUP_COOKIE_NAME = "ration_tos_signup";

const EMAIL_KEY_PREFIX = "tos-signup-intent:email:";
const TOKEN_KEY_PREFIX = "tos-signup-intent:token:";

export type SignupIntentPayload = {
	tosVersion: string;
};

export function normalizeSignupEmail(email: string): string {
	return email.trim().toLowerCase();
}

function emailKey(email: string): string {
	return `${EMAIL_KEY_PREFIX}${normalizeSignupEmail(email)}`;
}

function tokenKey(token: string): string {
	return `${TOKEN_KEY_PREFIX}${token}`;
}

export async function putSignupIntentForEmail(
	kv: KVNamespace,
	email: string,
	tosVersion: string = CURRENT_TOS_VERSION,
): Promise<void> {
	const payload: SignupIntentPayload = { tosVersion };
	await kv.put(emailKey(email), JSON.stringify(payload), {
		expirationTtl: TOS_SIGNUP_INTENT_TTL_SEC,
	});
}

/** Clears a pending email intent so Sign In cannot consume a planted Sign Up consent. */
export async function clearSignupIntentForEmail(
	kv: KVNamespace,
	email: string,
): Promise<void> {
	await kv.delete(emailKey(email));
}

/** Anonymous token for web OAuth Sign Up (email unknown until callback). */
export async function putSignupIntentToken(
	kv: KVNamespace,
	tosVersion: string = CURRENT_TOS_VERSION,
): Promise<string> {
	const token = crypto.randomUUID();
	const payload: SignupIntentPayload = { tosVersion };
	await kv.put(tokenKey(token), JSON.stringify(payload), {
		expirationTtl: TOS_SIGNUP_INTENT_TTL_SEC,
	});
	return token;
}

function parsePayload(raw: string | null): SignupIntentPayload | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { tosVersion?: unknown };
		if (typeof parsed.tosVersion !== "string" || !parsed.tosVersion) {
			return null;
		}
		return { tosVersion: parsed.tosVersion };
	} catch {
		return null;
	}
}

export async function consumeSignupIntentForEmail(
	kv: KVNamespace,
	email: string,
): Promise<SignupIntentPayload | null> {
	const key = emailKey(email);
	const raw = await kv.get(key);
	const payload = parsePayload(raw);
	if (payload) {
		await kv.delete(key);
	}
	return payload;
}

export async function consumeSignupIntentToken(
	kv: KVNamespace,
	token: string,
): Promise<SignupIntentPayload | null> {
	const key = tokenKey(token);
	const raw = await kv.get(key);
	const payload = parsePayload(raw);
	if (payload) {
		await kv.delete(key);
	}
	return payload;
}

export function buildSignupIntentCookie(
	token: string,
	opts?: { secure?: boolean },
): string {
	const maxAge = TOS_SIGNUP_INTENT_TTL_SEC;
	const secure = opts?.secure !== false ? "; Secure" : "";
	return `${TOS_SIGNUP_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSignupIntentCookie(opts?: { secure?: boolean }): string {
	const secure = opts?.secure !== false ? "; Secure" : "";
	return `${TOS_SIGNUP_COOKIE_NAME}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

export function parseSignupIntentCookie(
	cookieHeader: string | null | undefined,
): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const trimmed = part.trim();
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const name = trimmed.slice(0, eq).trim();
		if (name !== TOS_SIGNUP_COOKIE_NAME) continue;
		const value = trimmed.slice(eq + 1).trim();
		if (!value) return null;
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}
	return null;
}

/**
 * Prefer email-keyed intent (magic link / mobile); fall back to OAuth cookie token.
 */
export async function consumeSignupIntent(
	kv: KVNamespace,
	email: string | null | undefined,
	request: Request | null | undefined,
): Promise<SignupIntentPayload | null> {
	if (email) {
		const byEmail = await consumeSignupIntentForEmail(kv, email);
		if (byEmail) return byEmail;
	}
	const token = parseSignupIntentCookie(request?.headers.get("cookie"));
	if (!token) return null;
	return consumeSignupIntentToken(kv, token);
}

/** Best-effort email from a Google/Apple ID token payload (unverified). */
export function emailFromIdTokenPayload(idToken: string): string | null {
	const parts = idToken.split(".");
	if (parts.length < 2) return null;
	try {
		const segment = parts[1];
		const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
		const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(json) as { email?: unknown };
		return typeof payload.email === "string" && payload.email.includes("@")
			? payload.email
			: null;
	} catch {
		return null;
	}
}
