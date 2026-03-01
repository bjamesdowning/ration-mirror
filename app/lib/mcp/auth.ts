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

export async function authenticateMcp(
	env: Cloudflare.Env,
	request: Request,
): Promise<string> {
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
		scopes = JSON.parse(record.scopes) as string[];
	} catch {
		scopes = [];
	}

	if (!scopes.includes("mcp")) {
		throw new Error("Insufficient scope: API key must have 'mcp' scope");
	}

	return record.organizationId;
}
