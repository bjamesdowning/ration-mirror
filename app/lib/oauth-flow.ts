import { OAUTH_MCP_SCOPES, type OAuthMcpScope } from "./oauth.constants";
import { requiresOAuthOrgSelection } from "./oauth.server";

export type OAuthPostAuthPath = "/oauth/select-org" | "/oauth/consent";

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

/**
 * Where to send an already-authenticated user in the MCP OAuth browser flow.
 * Must mirror Better Auth `postLogin.shouldRedirect` so we do not skip household selection.
 */
export function resolveOAuthPostAuthPath(
	searchParams: URLSearchParams,
	oauthQuery: string | null,
	activeOrganizationId: string | null | undefined,
): OAuthPostAuthPath {
	if (searchParams.get("post_login") === "true") {
		return "/oauth/select-org";
	}

	const scopeParam =
		searchParams.get("scope") ??
		(oauthQuery ? new URLSearchParams(oauthQuery).get("scope") : null) ??
		"";
	const scopes = scopeParam.split(/\s+/).filter(Boolean);

	if (requiresOAuthOrgSelection(scopes) && !activeOrganizationId) {
		return "/oauth/select-org";
	}

	return "/oauth/consent";
}

/** Safe detail string for logs (no secrets). */
export function oauthErrorDetail(error: unknown): string {
	if (error instanceof Error) {
		return error.message.slice(0, 200);
	}
	return String(error).slice(0, 200);
}
