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
	"Complete browser sign-in, select your household, and approve permissions (in that order)",
	"Manage or revoke access anytime in Hub → Settings → Developer → MCP",
] as const;

/** Compact setup steps for in-app UI (no markdown backticks). */
export const MCP_SETUP_STEPS_SHORT = [
	"Add the MCP server URL in your AI client",
	"Sign in, select your household, and approve scopes",
	"Manage or revoke access anytime in Settings → Developer → MCP",
] as const;

/** Developer Overview path cards. */
export const DEVELOPER_OVERVIEW_PATHS = {
	mcp: {
		title: "Connect an AI agent",
		description:
			"OAuth MCP for Cursor, Claude Desktop, and compatible clients.",
		bullets: [
			"Paste one MCP server URL",
			"Authorize in your browser with scoped consent",
			"No API key required for standard clients",
		],
		cta: "Open MCP setup",
	},
	rest: {
		title: "REST & automation",
		description:
			"API keys for scripts, CI, and bulk CSV/JSON export or import.",
		bullets: [
			"Organization-scoped keys with least-privilege scopes",
			"REST v1 for Cargo, Galley, and Supply",
			"Advanced MCP header auth when OAuth is unavailable",
		],
		cta: "Manage API keys",
	},
} as const;

/** OAuth troubleshooting rows for Hub Settings and docs. */
export const MCP_OAUTH_TROUBLESHOOTING = [
	{
		symptom: 'Browser shows "No authorization code received"',
		fix: "Your MCP client reached its OAuth callback without a code — usually Deny was clicked, the flow expired (~10 minutes), or an old browser tab was reused. Remove the MCP server in Cursor, re-add the URL, and complete sign-in → household → Authorize in one fresh tab. Prefer native URL config over mcp-remote when Cursor supports it.",
	},
	{
		symptom: "Browser opens repeatedly or authorization fails",
		fix: "Revoke the grant below, remove the MCP server in your client, re-add the URL, and finish sign-in → household → authorize in one tab within a few minutes.",
	},
	{
		symptom: "Agent listed here but tools fail",
		fix: 'Revoke and reconnect — the grant may be incomplete (shows "Not linked"). Household selection is required for every new connection.',
	},
	{
		symptom: "Wrong pantry data",
		fix: "Revoke and reconnect, choosing the correct household at the selection step.",
	},
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

Advanced: organization API keys with mcp:* scopes remain supported for REST v1 and manual MCP header auth. Create keys in Hub → Settings → Developer → API Keys.`;
}
