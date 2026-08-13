import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolContext } from "./auth";
import { registerResourcesAndPrompts } from "./resources";
import type { McpToolsEnv } from "./tool-runtime";
import { registerBillingTools } from "./tools/billing";
import { registerKitchenEventTools } from "./tools/events";
import { registerGalleyTools } from "./tools/galley";
import { registerInventoryTools } from "./tools/inventory";
import { registerManifestTools } from "./tools/manifest";
import { registerNutritionTools } from "./tools/nutrition";
import { registerPreferencesTools } from "./tools/preferences";
import { registerReadTools } from "./tools/read";
import { registerSupplyTools } from "./tools/supply";

/**
 * Registers the credit-free MCP kitchen tool surface.
 * Billed Gemini jobs (scan, URL import, Galley Generate, Plan Week) stay on
 * native web/iOS only — they are not MCP or Copilot tools.
 */
export function registerTools(
	server: McpServer,
	env: Cloudflare.Env & { __mcp: McpToolContext },
): void {
	registerResourcesAndPrompts(server);

	const toolsEnv = env as McpToolsEnv;
	registerReadTools(server, toolsEnv);
	registerKitchenEventTools(server, toolsEnv);
	registerBillingTools(server, toolsEnv);
	registerInventoryTools(server, toolsEnv);
	registerGalleyTools(server, toolsEnv);
	registerManifestTools(server, toolsEnv);
	registerSupplyTools(server, toolsEnv);
	registerPreferencesTools(server, toolsEnv);
	registerNutritionTools(server, toolsEnv);
}
