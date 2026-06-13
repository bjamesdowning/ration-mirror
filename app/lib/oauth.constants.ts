/**
 * OAuth / MCP authorization constants shared by AS (app worker) and RS (MCP worker).
 */

/** Granular MCP scopes exposed via OAuth consent (excludes legacy blanket `mcp`). */
export const OAUTH_MCP_SCOPES = [
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
	/** Fin service agent — may act on behalf of end-users via signed actor_token. */
	"mcp:delegate",
] as const;

export type OAuthMcpScope = (typeof OAUTH_MCP_SCOPES)[number];

/** Granular MCP scopes available via open DCR (excludes Fin-only `mcp:delegate`). */
export const OAUTH_DCR_MCP_SCOPES = OAUTH_MCP_SCOPES.filter(
	(s): s is Exclude<OAuthMcpScope, "mcp:delegate"> => s !== "mcp:delegate",
);

/** Scopes allowed at dynamic client registration (no `mcp:delegate`). */
export const OAUTH_REGISTRATION_SCOPES = [
	...OAUTH_DCR_MCP_SCOPES,
	"offline_access",
] as const;

/** Default scopes for newly registered MCP clients (read + optional write at consent). */
export const OAUTH_REGISTRATION_DEFAULT_SCOPES = [
	...OAUTH_DCR_MCP_SCOPES,
	"offline_access",
] as const;

/** Full OAuth provider vocabulary (includes Fin `mcp:delegate` for trusted clients). */
export const OAUTH_PROVIDER_SCOPES = [
	...OAUTH_MCP_SCOPES,
	"offline_access",
] as const;

/** MCP scope pre-checked on the consent screen. */
export const OAUTH_CONSENT_DEFAULT_CHECKED_SCOPES = ["mcp:read"] as const;

/** Native MCP client callback URL schemes (custom URI handlers). */
export const NATIVE_MCP_CALLBACK_PROTOCOLS = [
	"cursor:",
	"warp:",
	"vscode:",
	"windsurf:",
] as const;

/** JWT claim namespace for Ration-specific org binding. */
export const RATION_ORG_CLAIM = "https://ration.mayutic.com/org";

/** Production MCP resource audience (RFC 8707). */
export const MCP_RESOURCE_AUDIENCE_PROD = "https://mcp.ration.mayutic.com/mcp";

/** Access token lifetime — 10 minutes (plan: 5–15 min). */
export const OAUTH_ACCESS_TOKEN_TTL_SEC = 600;

export function getAuthorizationServerIssuer(authBaseUrl: string): string {
	return authBaseUrl.replace(/\/$/, "");
}

export function getMcpResourceAudience(
	requestOrOrigin: Request | string,
): string {
	if (typeof requestOrOrigin === "string") {
		const origin = requestOrOrigin.replace(/\/$/, "");
		return `${origin}/mcp`;
	}
	const url = new URL(requestOrOrigin.url);
	return `${url.origin}/mcp`;
}

export function getMcpResourceOrigin(
	requestOrOrigin: Request | string,
): string {
	if (typeof requestOrOrigin === "string") {
		return requestOrOrigin.replace(/\/$/, "");
	}
	return new URL(requestOrOrigin.url).origin;
}

export function resolveMcpResourceAudience(env: Cloudflare.Env): string {
	const base = env.BETTER_AUTH_URL ?? "";
	if (base.includes("localhost") || base.includes("127.0.0.1")) {
		const hostname = base.includes("8787")
			? "localhost:8787"
			: "localhost:5173";
		return `http://${hostname}/mcp`;
	}
	return MCP_RESOURCE_AUDIENCE_PROD;
}

export function resolveAuthorizationServerUrl(env: Cloudflare.Env): string {
	return getAuthorizationServerIssuer(env.BETTER_AUTH_URL);
}

/**
 * The OAuth issuer identifier as advertised in the authorization-server
 * metadata and embedded in the JWT `iss` claim. Better Auth mounts under the
 * `/api/auth` basePath, so the issuer is the origin plus that path — NOT the
 * bare origin. This must match the `iss` claim exactly or `jwtVerify` rejects
 * every token.
 */
export function resolveAuthorizationServerIssuer(env: Cloudflare.Env): string {
	return `${getAuthorizationServerIssuer(env.BETTER_AUTH_URL)}/api/auth`;
}

/** Human-readable labels for consent UI. */
export const OAUTH_SCOPE_LABELS: Record<OAuthMcpScope, string> = {
	"mcp:read": "Read kitchen data (inventory, meals, plans, supply lists)",
	"mcp:inventory:write": "Add, update, and remove Cargo inventory",
	"mcp:galley:write": "Create and manage Galley meals",
	"mcp:manifest:write": "Manage meal plan entries",
	"mcp:supply:write": "Manage Supply shopping lists",
	"mcp:preferences:write": "Update account preferences",
	"mcp:delegate":
		"Act on behalf of verified end-users (Fin service agent only)",
};

export function isApiKeyCredential(raw: string): boolean {
	return raw.startsWith("rtn_live_");
}

export function isLikelyJwt(raw: string): boolean {
	return raw.split(".").length === 3;
}
