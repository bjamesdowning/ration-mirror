/**
 * Shared user-facing copy for OAuth-first MCP connection.
 * Import from UI, agent-readiness, MCP resources, and docs generators.
 */

/** Production MCP server URL (Streamable HTTP transport). */
export const MCP_ENDPOINT_URL = "https://mcp.ration.mayutic.com/mcp";

/** Hub Settings anchor for Connected Agents management. */
export const CONNECTED_AGENTS_SETTINGS_PATH = "/hub/settings#connected-agents";

/** OAuth-first connection steps (plain strings for markdown/docs). */
export const MCP_CONNECT_STEPS = [
	`In your MCP client, add server URL \`${MCP_ENDPOINT_URL}\``,
	"Complete browser sign-in, pick your household, and approve permissions",
	"Manage or revoke access anytime in Hub → Settings → Connected Agents",
] as const;

/** Short positioning line for marketing surfaces. */
export const MCP_AGENT_READY_TAGLINE =
	"Paste one URL, authorize in your browser, and your AI agent can operate your kitchen with scoped consent.";

/** Supported MCP clients (paste-URL / OAuth discovery). */
export const MCP_SUPPORTED_CLIENTS = [
	"Cursor",
	"Claude Desktop",
	"ChatGPT desktop",
	"Zed",
	"Any MCP client with OAuth 2.1 discovery",
] as const;

/** mcp-remote config for advanced API-key auth (manual header). */
export const MCP_API_KEY_CONFIG_SNIPPET = `{
  "mcpServers": {
    "ration": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "${MCP_ENDPOINT_URL}",
        "--header",
        "Authorization:\${RATION_AUTH_HEADER}"
      ],
      "env": {
        "RATION_AUTH_HEADER": "Bearer <your-mcp-scoped-key>"
      }
    }
  }
}`;

/** Markdown block for agent skills and connection guides. */
export function formatMcpConnectMarkdown(): string {
	return MCP_CONNECT_STEPS.map((step, i) => `${i + 1}. ${step}`).join("\n");
}

/** Plain-text connection guide for MCP resources. */
export function formatMcpConnectPlainText(): string {
	const steps = MCP_CONNECT_STEPS.map((step, i) => `${i + 1}. ${step}`).join(
		"\n",
	);
	return `${MCP_AGENT_READY_TAGLINE}

${steps}

Advanced: organization API keys with mcp:* scopes remain supported for REST v1 and manual MCP header auth. Create keys in Hub → Settings → API Keys.`;
}
