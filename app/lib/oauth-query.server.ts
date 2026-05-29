import { OAUTH_MCP_SCOPES, type OAuthMcpScope } from "./oauth.constants";

export type OAuthPagePath =
	| "/oauth/sign-in"
	| "/oauth/select-org"
	| "/oauth/consent";

/**
 * Extract the signed Better Auth oauth_query from a request URL.
 * Prefer nested `oauth_query` param; else flat query string when `sig` is present.
 */
export function getSignedOAuthQuery(url: URL): string | null {
	const nested = url.searchParams.get("oauth_query")?.trim();
	if (nested) {
		return nested;
	}
	if (url.searchParams.get("sig")) {
		const qs = url.search.slice(1);
		return qs.length > 0 ? qs : null;
	}
	return null;
}

/** Build a Ration OAuth page URL with a single opaque signed query param. */
export function buildOAuthPageUrl(
	path: OAuthPagePath,
	signedQuery: string,
): string {
	return `${path}?oauth_query=${encodeURIComponent(signedQuery)}`;
}

/** Parse `scope` from a Better Auth signed oauth_query blob. */
export function parseScopesFromSignedQuery(signedQuery: string): string[] {
	const scope = new URLSearchParams(signedQuery).get("scope");
	if (!scope) {
		return [];
	}
	return scope.split(/\s+/).filter(Boolean);
}

/**
 * Scopes to send to `oauth2Consent`: selected MCP scopes plus non-MCP scopes from
 * the original request (e.g. `offline_access`) that are not shown as checkboxes.
 */
export function buildConsentScopeForSubmit(
	selectedMcpScopes: OAuthMcpScope[],
	signedQuery: string,
): string {
	const requested = parseScopesFromSignedQuery(signedQuery);
	const nonMcp = requested.filter((s) => !s.startsWith("mcp:") && s !== "mcp");
	const mcpFromForm = selectedMcpScopes;
	const mcpFallback = requested.filter((s): s is OAuthMcpScope =>
		(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
	);
	const mcp = mcpFromForm.length > 0 ? mcpFromForm : mcpFallback;
	return [...new Set([...mcp, ...nonMcp])].join(" ");
}

/** Merge Set-Cookie from an auth.api response into request headers for follow-up calls. */
export function mergeSessionCookies(
	request: Request,
	authResult: { headers: Headers },
): Headers {
	const headers = new Headers(request.headers);
	authResult.headers.forEach((value, key) => {
		if (key.toLowerCase() === "set-cookie") {
			headers.append("set-cookie", value);
		}
	});
	return headers;
}

/** Safe detail string for logs (no secrets). */
export function oauthErrorDetail(error: unknown): string {
	if (error instanceof Error) {
		return error.message.slice(0, 200);
	}
	return String(error).slice(0, 200);
}
