import { makeSignature } from "better-auth/crypto";
import { getAuth } from "~/lib/auth.server";

type SessionCookieAttributes = {
	maxAge?: number;
	path?: string;
	domain?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: string;
};

function formatSameSite(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Same signed-cookie shape Better Auth's session cookie uses. */
export async function serializeBetterAuthSignedCookie(
	name: string,
	token: string,
	secret: string,
	attributes: SessionCookieAttributes,
): Promise<string> {
	const signature = await makeSignature(token, secret);
	const value = encodeURIComponent(`${token}.${signature}`);
	const parts = [`${name}=${value}`];
	if (typeof attributes.maxAge === "number" && attributes.maxAge >= 0) {
		parts.push(`Max-Age=${Math.floor(attributes.maxAge)}`);
	}
	if (attributes.domain) {
		parts.push(`Domain=${attributes.domain}`);
	}
	if (attributes.path) {
		parts.push(`Path=${attributes.path}`);
	}
	if (attributes.httpOnly) {
		parts.push("HttpOnly");
	}
	if (attributes.secure) {
		parts.push("Secure");
	}
	if (attributes.sameSite) {
		parts.push(`SameSite=${formatSameSite(attributes.sameSite)}`);
	}
	return parts.join("; ");
}

/**
 * Accept a same-origin path, or an absolute URL on this request's origin.
 * Anything else becomes the hub so the review form cannot be an open redirect.
 */
export function resolveWebReviewCallback(
	raw: string | undefined,
	request: Request,
): string {
	const fallback = "/hub";
	if (!raw) return fallback;
	const value = raw.trim();
	if (!value || value.length > 2048) return fallback;
	if (
		value.startsWith("/") &&
		!value.startsWith("//") &&
		!value.includes("\\") &&
		!value.includes("\n") &&
		!value.includes("\r")
	) {
		return value;
	}
	try {
		const target = new URL(value);
		const origin = new URL(request.url).origin;
		if (
			target.origin === origin &&
			(target.protocol === "http:" || target.protocol === "https:")
		) {
			return `${target.pathname}${target.search}${target.hash}`;
		}
	} catch {
		return fallback;
	}
	return fallback;
}

/**
 * Creates a normal Better Auth web session for the review user and returns
 * the Set-Cookie header value. Does not mint mobile JWTs.
 */
export async function issueWebReviewSessionCookie(
	env: Cloudflare.Env,
	userId: string,
	request: Request,
): Promise<string> {
	const auth = getAuth(env);
	const ctx = await auth.$context;
	const session = await ctx.internalAdapter.createSession(userId, false, {
		ipAddress:
			request.headers.get("CF-Connecting-IP") ??
			request.headers.get("X-Forwarded-For") ??
			"",
		userAgent: request.headers.get("User-Agent") ?? "",
	});
	const token = session?.token;
	if (typeof token !== "string" || token.length === 0) {
		throw new Error("Review session was not created.");
	}
	const cookie = ctx.authCookies.sessionToken;
	const attributes = cookie.attributes ?? {};
	const maxAge =
		typeof ctx.sessionConfig?.expiresIn === "number"
			? ctx.sessionConfig.expiresIn
			: attributes.maxAge;
	const secret = ctx.secret;
	if (typeof secret !== "string" || secret.length === 0) {
		throw new Error("Session signing secret is not configured.");
	}
	return serializeBetterAuthSignedCookie(cookie.name, token, secret, {
		path: attributes.path,
		domain: attributes.domain,
		httpOnly: attributes.httpOnly,
		secure: attributes.secure,
		sameSite: attributes.sameSite,
		maxAge,
	});
}
