import { MCP_ENDPOINT_URL } from "./connect-copy";

export type McpClientId = "cursor" | "claude" | "chatgpt";

const MCP_CONFIG = {
	mcpServers: {
		ration: {
			url: MCP_ENDPOINT_URL,
		},
	},
} as const;

function encodeConfig(config: object): string {
	return encodeURIComponent(JSON.stringify(config));
}

/** Deep link to add Ration MCP in Cursor. */
export function buildCursorDeepLink(): string {
	return `cursor://anysphere.cursor-deeplink/mcp/install?name=Ration&config=${encodeConfig(MCP_CONFIG)}`;
}

/** Deep link to add Ration MCP in Claude Desktop. */
export function buildClaudeDeepLink(): string {
	return `claude://mcp/install?name=Ration&config=${encodeConfig(MCP_CONFIG)}`;
}

/** Deep link / config URI for ChatGPT desktop MCP setup. */
export function buildChatGptDeepLink(): string {
	return `chatgpt://mcp/install?name=Ration&config=${encodeConfig(MCP_CONFIG)}`;
}

export function buildMcpDeepLink(client: McpClientId): string {
	switch (client) {
		case "cursor":
			return buildCursorDeepLink();
		case "claude":
			return buildClaudeDeepLink();
		case "chatgpt":
			return buildChatGptDeepLink();
		default: {
			const _exhaustive: never = client;
			return _exhaustive;
		}
	}
}

export const MCP_DEEP_LINK_CLIENTS: {
	id: McpClientId;
	label: string;
	build: () => string;
}[] = [
	{ id: "cursor", label: "Cursor", build: buildCursorDeepLink },
	{ id: "claude", label: "Claude", build: buildClaudeDeepLink },
	{ id: "chatgpt", label: "ChatGPT", build: buildChatGptDeepLink },
];
