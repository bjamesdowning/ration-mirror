import { describe, expect, it } from "vitest";
import type { McpToolContext } from "../auth";
import type { McpToolsEnv } from "../tool-runtime";
import { createSavedFoodToolDefs } from "../tools/saved-food";

const mcp = {
	organizationId: "org-1",
	userId: "user-a",
	apiKeyId: "key-1",
	keyName: "Test",
	keyPrefix: "ration_test",
	scopes: ["mcp:nutrition:read", "mcp:nutrition:write"],
	authMethod: "api_key",
	agentSurface: "mcp",
} as McpToolContext;

const env = {
	RATION_ENV: "test",
	__mcp: mcp,
} as unknown as McpToolsEnv & { __mcp: McpToolContext };

describe("saved food MCP tools", () => {
	it("requires approval and refuses delete without confirm", async () => {
		const defs = createSavedFoodToolDefs(env);
		const save = defs.find((tool) => tool.name === "save_food");
		const remove = defs.find((tool) => tool.name === "delete_saved_food");
		expect(save?.needsApproval).toBe(true);
		expect(remove?.needsApproval).toBe(true);
		if (!remove) throw new Error("missing delete_saved_food");
		const result = await remove.handler(env.__mcp, {
			confirm: false,
			savedFoodId: "55555555-5555-4555-8555-555555555555",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid_input");
	});
});
