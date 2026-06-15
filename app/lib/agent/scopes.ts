/** Pre-claim agent API key scopes — read-only, no billing, no destructive ops. */
export const PRE_CLAIM_API_SCOPES = ["mcp:read"] as const;

/** Post-claim agent API key scopes — full MCP write (no delegate, no billing). */
export const POST_CLAIM_API_SCOPES = [
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
] as const;
