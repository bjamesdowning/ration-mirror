import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolContext } from "./auth";
import { registerResourcesAndPrompts } from "./resources";
import type { McpToolsEnv } from "./tool-runtime";
import { registerAiWorkflowTools } from "./tools/ai-workflows";
import { registerBillingTools } from "./tools/billing";
import { registerGalleyTools } from "./tools/galley";
import { registerInventoryTools } from "./tools/inventory";
import { registerManifestTools } from "./tools/manifest";
import { registerPreferencesTools } from "./tools/preferences";
import { registerReadTools } from "./tools/read";
import { registerSupplyTools } from "./tools/supply";

export function registerTools(
	server: McpServer,
	env: Cloudflare.Env & { __mcp: McpToolContext },
): void {
	registerResourcesAndPrompts(server);

	const toolsEnv = env as McpToolsEnv;
	registerReadTools(server, toolsEnv);
	registerBillingTools(server, toolsEnv);
	registerInventoryTools(server, toolsEnv);
	registerGalleyTools(server, toolsEnv);
	registerManifestTools(server, toolsEnv);
	registerSupplyTools(server, toolsEnv);
	registerPreferencesTools(server, toolsEnv);
	registerAiWorkflowTools(server, toolsEnv);
}
