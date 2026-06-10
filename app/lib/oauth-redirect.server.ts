import { NATIVE_MCP_CALLBACK_PROTOCOLS } from "./oauth.constants";

/**
 * Parse Better Auth oauth2Continue / oauth2Consent responses.
 * Never construct OAuth redirect URLs by hand in routes.
 */

function isNativeMcpClientProtocol(protocol: string): boolean {
	return (NATIVE_MCP_CALLBACK_PROTOCOLS as readonly string[]).includes(
		protocol,
	);
}

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
 * - Absolute http(s) and native MCP client schemes (cursor://, warp://, etc.).
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
		if (isNativeMcpClientProtocol(parsed.protocol)) {
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

export type OAuthClientRedirectKind = "internal" | "code" | "error" | "invalid";

export type OAuthClientRedirectClassification = {
	kind: OAuthClientRedirectKind;
	error?: string;
	errorDescription?: string;
};

function isMcpClientCallbackHost(hostname: string): boolean {
	return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Classify Better Auth redirect targets before sending the browser to an MCP
 * client callback. Cursor and mcp-remote show "No authorization code received"
 * when the callback URL loads without `code=` — including OAuth error redirects
 * (`error=access_denied`, etc.) that never include an authorization code.
 */
export function classifyOAuthClientRedirect(
	url: string,
): OAuthClientRedirectClassification {
	if (url.startsWith("/") && !url.startsWith("//")) {
		return { kind: "internal" };
	}

	try {
		const parsed = new URL(url);
		if (parsed.searchParams.has("code")) {
			return { kind: "code" };
		}
		if (parsed.searchParams.has("error")) {
			return {
				kind: "error",
				error: parsed.searchParams.get("error") ?? undefined,
				errorDescription:
					parsed.searchParams.get("error_description") ?? undefined,
			};
		}

		const isClientCallback =
			isNativeMcpClientProtocol(parsed.protocol) ||
			(parsed.protocol === "http:" && isMcpClientCallbackHost(parsed.hostname));

		if (isClientCallback) {
			return { kind: "invalid" };
		}

		if (parsed.protocol === "https:" || parsed.protocol === "http:") {
			return { kind: "internal" };
		}
	} catch {
		return { kind: "invalid" };
	}

	return { kind: "invalid" };
}

/** Map OAuth error redirects to actionable Ration flow error codes. */
export function mapOAuthCallbackError(
	error?: string,
): "consent_rejected" | "flow_invalid" | "flow_expired" {
	if (error === "access_denied") {
		return "consent_rejected";
	}
	if (error === "invalid_scope" || error === "invalid_request") {
		return "flow_invalid";
	}
	if (error === "server_error" || error === "temporarily_unavailable") {
		return "flow_expired";
	}
	return "flow_invalid";
}
