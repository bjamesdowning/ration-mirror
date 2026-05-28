import { verifyApiKey } from "../api-key.server";
import { isApiKeyCredential } from "../oauth.constants";
import { verifyMcpOAuthToken } from "./oauth-token.server";

/**
 * Exhaustive set of all error messages thrown by authenticateMcp.
 * Used by the worker to distinguish auth failures (401) from internal errors (500)
 * without leaking implementation details back to the caller.
 */
export const MCP_AUTH_ERRORS = new Set([
	"Missing credentials - provide OAuth Bearer token or API key",
	"Invalid API key",
	"Insufficient scope: API key must include 'mcp' or a granular 'mcp:*' scope",
	"Invalid OAuth access token",
	"OAuth token audience mismatch",
	"OAuth token missing organization binding",
	"OAuth token organization access revoked",
	"OAuth token missing MCP scopes",
	"OAuth grant revoked",
]);

export type McpAuthMethod = "api_key" | "oauth";

/**
 * Rich per-request context for MCP tool handlers.
 *
 * Built once during authentication and injected via `env.__mcp` so tools can
 * read scopes, the API key identity (for audit logs), and the user/org/tier
 * surface without re-parsing on every call.
 */
export interface McpToolContext {
	organizationId: string;
	userId: string;
	/** Parsed once; safe to consult multiple times within a request. */
	scopes: string[];
	authMethod: McpAuthMethod;
	/** Present for API-key auth; OAuth client id for delegated tokens. */
	apiKeyId: string;
	keyName: string;
	keyPrefix: string;
	oauthClientId?: string;
}

function isOAuthEnabled(env: Cloudflare.Env): boolean {
	const flag = env.MCP_OAUTH_ENABLED;
	return flag === undefined || flag === "true";
}

async function authenticateApiKey(
	env: Cloudflare.Env,
	rawKey: string,
): Promise<McpToolContext> {
	const record = await verifyApiKey(env.DB, rawKey);
	if (!record) {
		throw new Error("Invalid API key");
	}

	let scopes: string[];
	try {
		const parsed = JSON.parse(record.scopes);
		scopes = Array.isArray(parsed)
			? parsed.filter((s): s is string => typeof s === "string")
			: [];
	} catch {
		scopes = [];
	}

	const hasAnyMcpScope = scopes.some(
		(s) => s === "mcp" || s.startsWith("mcp:"),
	);
	if (!hasAnyMcpScope) {
		throw new Error(
			"Insufficient scope: API key must include 'mcp' or a granular 'mcp:*' scope",
		);
	}

	return {
		organizationId: record.organizationId,
		apiKeyId: record.id,
		userId: record.userId,
		keyName: record.name,
		keyPrefix: record.keyPrefix,
		scopes,
		authMethod: "api_key",
	};
}

async function authenticateOAuthToken(
	env: Cloudflare.Env,
	rawToken: string,
): Promise<McpToolContext> {
	const verified = await verifyMcpOAuthToken(env, rawToken);
	const clientLabel = verified.clientId ?? "oauth-agent";
	return {
		organizationId: verified.organizationId,
		apiKeyId: verified.clientId ?? `oauth:${verified.userId}`,
		userId: verified.userId,
		keyName: clientLabel,
		keyPrefix: "oauth_",
		scopes: verified.scopes,
		authMethod: "oauth",
		oauthClientId: verified.clientId,
	};
}

/**
 * Authenticate an MCP request and return the rich tool context.
 * Supports OAuth JWT bearer tokens (preferred) and organization API keys (fallback).
 */
export async function authenticateMcp(
	env: Cloudflare.Env,
	request: Request,
): Promise<McpToolContext> {
	const authHeader = request.headers.get("Authorization");
	const xApiKey = request.headers.get("X-Api-Key");
	const bearer =
		authHeader?.replace(/^Bearer\s+/i, "").trim() ??
		(!authHeader && xApiKey ? xApiKey : undefined);

	if (!bearer) {
		throw new Error(
			"Missing credentials - provide OAuth Bearer token or API key",
		);
	}

	if (isApiKeyCredential(bearer)) {
		return authenticateApiKey(env, bearer);
	}

	// Any non-API-key credential is treated as an OAuth bearer token when the
	// delegated flow is enabled; `verifyMcpOAuthToken` rejects non-JWT input.
	if (isOAuthEnabled(env)) {
		return authenticateOAuthToken(env, bearer);
	}

	throw new Error("Invalid API key");
}
