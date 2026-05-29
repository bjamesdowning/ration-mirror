import { OAUTH_MCP_SCOPES, type OAuthMcpScope } from "./oauth.constants";

/** Query keys Ration adds; must not be included in Better Auth signed `oauth_query`. */
export const OAUTH_ORCHESTRATOR_QUERY_KEYS = new Set([
	"flow_id",
	"post_login",
	"household_selected",
]);

/**
 * Build the signed oauth_query string Better Auth expects (sig/exp verified
 * without orchestrator params mixed in).
 */
export function extractSignedOAuthQueryParams(
	params: URLSearchParams,
): string | null {
	const cleaned = new URLSearchParams();
	for (const [key, value] of params.entries()) {
		if (key === "oauth_query") {
			continue;
		}
		if (!OAUTH_ORCHESTRATOR_QUERY_KEYS.has(key)) {
			cleaned.append(key, value);
		}
	}
	const nested = params.get("oauth_query")?.trim();
	if (nested) {
		return sanitizeOAuthQueryForBetterAuth(nested);
	}
	if (cleaned.get("client_id") && cleaned.get("sig")) {
		return cleaned.toString();
	}
	return null;
}

/** Strip orchestrator keys from a raw oauth_query form value before BA API calls. */
export function sanitizeOAuthQueryForBetterAuth(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return trimmed;
	}
	const extracted = extractSignedOAuthQueryParams(new URLSearchParams(trimmed));
	return extracted ?? trimmed;
}

/** Merge Set-Cookie from an auth.api response into request headers for follow-up calls. */
export function mergeAuthRequestHeaders(
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

/** Parse `scope` from a Better Auth `oauth_query` blob (URL query string). */
export function parseScopesFromOAuthQuery(oauthQuery: string): string[] {
	const clean = sanitizeOAuthQueryForBetterAuth(oauthQuery);
	if (!clean) {
		return [];
	}
	const scope = new URLSearchParams(clean).get("scope");
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
	oauthQuery: string,
): string {
	const requested = parseScopesFromOAuthQuery(
		sanitizeOAuthQueryForBetterAuth(oauthQuery),
	);
	const nonMcp = requested.filter((s) => !s.startsWith("mcp:") && s !== "mcp");
	const mcpFromForm = selectedMcpScopes;
	const mcpFallback = requested.filter((s): s is OAuthMcpScope =>
		(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
	);
	const mcp = mcpFromForm.length > 0 ? mcpFromForm : mcpFallback;
	return [...new Set([...mcp, ...nonMcp])].join(" ");
}

/** Safe detail string for logs (no secrets). */
export function oauthErrorDetail(error: unknown): string {
	if (error instanceof Error) {
		return error.message.slice(0, 200);
	}
	return String(error).slice(0, 200);
}
