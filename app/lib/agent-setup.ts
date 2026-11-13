import { MCP_ENDPOINT_URL } from "./mcp/connect-copy";

/** Clipboard text for the public Copy prompt control. Production URL only. */
export const AGENT_SETUP_PROMPT =
	"Fetch and execute the appropriate instructions to set me up for Ration from https://ration.mayutic.com/setup.md";

/**
 * Public /setup.md. Short and imperative. The registration contract stays on /auth.md.
 */
export function buildSetupMarkdown(request: Request): string {
	const origin = new URL(request.url).origin;
	const page = `${origin}/setup.md`;
	const register = `${origin}/api/agent/auth`;
	const auth = `${origin}/auth.md`;
	const connect = `${origin}/connect`;

	return `# Ration setup

This file is published at ${page}. Fetch it again from that URL if you need to re-check the steps. Execute these steps. Do not hand them back.

You can open a kitchen. You cannot finish sign-in, claim, the App Store, or payment.

## OAuth

If this client can do MCP OAuth, add \`${MCP_ENDPOINT_URL}\` and stop. Tell the person to sign in, choose the household, and approve. Do not create a second kitchen.

Cursor, in \`.cursor/mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "ration": {
      "url": "${MCP_ENDPOINT_URL}"
    }
  }
}
\`\`\`

Claude Desktop: add that URL as a remote MCP server. ChatGPT desktop: add that URL in MCP settings. Reload the client if it asks. The person completes the browser. Then call \`get_context\`.

## No OAuth

If the client cannot do MCP OAuth, POST \`${register}\` with \`{ "type": "anonymous", "client_hint": "<client>" }\`.

Store \`api_key\` in the client secret config. Give the person only \`claim_url\`. Do not print the key.

Cursor, in \`.cursor/mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "ration": {
      "url": "${MCP_ENDPOINT_URL}",
      "headers": { "Authorization": "Bearer <api_key>" }
    }
  }
}
\`\`\`

Claude Desktop \`claude_desktop_config.json\`: same \`mcpServers.ration\` URL and Bearer header. ChatGPT desktop: same URL and Authorization header in MCP settings. Reload is the person's step.

## After the client connects

Call \`get_context\`. Stock the kitchen only when the person asked for food, meals, or a list.

## Stop

Stop at claim, OAuth, the App Store, Stripe, nutrition consent, and hosted scan or URL import.

- Contract: ${auth}
- Connect: ${connect}
- MCP: ${MCP_ENDPOINT_URL}
`;
}
