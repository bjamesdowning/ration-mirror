/** Agent API key scopes — full MCP write, no delegate, no billing. Same at Tier 0 and Tier 1. */
export const AGENT_API_KEY_SCOPES = [
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
] as const;
