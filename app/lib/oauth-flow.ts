import { OAUTH_MCP_SCOPES, type OAuthMcpScope } from "./oauth.constants";

/** Parse `scope` from a Better Auth `oauth_query` blob (URL query string). */
export function parseScopesFromOAuthQuery(oauthQuery: string): string[] {
	if (!oauthQuery.trim()) {
		return [];
	}
	const scope = new URLSearchParams(oauthQuery).get("scope");
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
	const requested = parseScopesFromOAuthQuery(oauthQuery);
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
