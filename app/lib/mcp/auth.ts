import { verifyApiKey } from "../api-key.server";

/**
 * Exhaustive set of all error messages thrown by authenticateMcp.
 * Used by the worker to distinguish auth failures (401) from internal errors (500)
 * without leaking implementation details back to the caller.
 */
export const MCP_AUTH_ERRORS = new Set([
	"Missing API key - provide via Authorization Bearer token",
	"Invalid API key",
	"Insufficient scope: API key must have 'mcp' scope",
]);

/**
 * Rich per-request context for MCP tool handlers.
 *
 * Built once during authentication and injected via `env.__mcp` so tools can
 * read scopes, the API key identity (for audit logs), and the user/org/tier
 * surface without re-parsing on every call.
 */
export interface McpToolContext {
	organizationId: string;
	apiKeyId: string;
	userId: string;
	keyName: string;
	keyPrefix: string;
	/** Parsed once; safe to consult multiple times within a request. */
	scopes: string[];
}

/**
 * Authenticate an MCP request and return the rich tool context.
 * Throws when the key is missing/invalid or lacks any MCP scope.
 *
 * Accepts the legacy broad `mcp` scope **or** any narrow `mcp:*` scope.
 * Per-tool scope enforcement is delegated to `requireScope` from `./scopes`.
 */
export async function authenticateMcp(
	env: Cloudflare.Env,
	request: Request,
): Promise<McpToolContext> {
	const authHeader = request.headers.get("Authorization");
	const xApiKey = request.headers.get("X-Api-Key");
	const rawKey = xApiKey ?? authHeader?.replace(/^Bearer\s+/i, "").trim();

	if (!rawKey) {
		throw new Error("Missing API key - provide via Authorization Bearer token");
	}

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
		throw new Error("Insufficient scope: API key must have 'mcp' scope");
	}

	return {
		organizationId: record.organizationId,
		apiKeyId: record.id,
		userId: record.userId,
		keyName: record.name,
		keyPrefix: record.keyPrefix,
		scopes,
	};
}
