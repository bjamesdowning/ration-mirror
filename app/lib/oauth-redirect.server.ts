/**
 * Parse Better Auth oauth2Continue / oauth2Consent responses.
 * Never construct OAuth redirect URLs by hand in routes.
 */

export type BetterAuthRedirectPayload = {
	redirect?: boolean;
	url?: string;
	redirect_uri?: string;
};

/** Extract redirect target URL from a Better Auth OAuth API result. */
export function getAuthRedirectUrl(result: unknown): string | null {
	if (!result || typeof result !== "object") {
		return null;
	}

	const payload = result as BetterAuthRedirectPayload;

	if (
		payload.redirect === true &&
		typeof payload.url === "string" &&
		payload.url.length > 0
	) {
		return payload.url;
	}

	if (
		typeof payload.redirect_uri === "string" &&
		payload.redirect_uri.length > 0
	) {
		return payload.redirect_uri;
	}

	return null;
}

/**
 * Reject open redirects while allowing the redirect shapes Better Auth emits:
 * - Root-relative, same-origin paths (its internal page redirects, e.g.
 *   "/oauth/consent?..."). Protocol-relative "//host" is rejected as it can
 *   escape our origin.
 * - Absolute http(s) and cursor:// schemes (the final MCP client callback).
 */
export function isAllowedOAuthRedirectUrl(url: string): boolean {
	if (url.startsWith("/") && !url.startsWith("//")) {
		return true;
	}
	try {
		const parsed = new URL(url);
		if (parsed.protocol === "https:" || parsed.protocol === "http:") {
			return true;
		}
		if (parsed.protocol === "cursor:") {
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

export function getSafeAuthRedirectUrl(result: unknown): string | null {
	const url = getAuthRedirectUrl(result);
	if (!url || !isAllowedOAuthRedirectUrl(url)) {
		return null;
	}
	return url;
}
