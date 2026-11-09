import { describe, expect, it } from "vitest";
import type { McpToolContext } from "../auth";
import type { McpToolsEnv } from "../tool-runtime";
import { createDiaryToolDefs } from "../tools/diary";

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
	FLAGS: { getBooleanValue: async () => true },
	__mcp: mcp,
} as unknown as McpToolsEnv & { __mcp: McpToolContext };

describe("diary MCP tools", () => {
	it("always asks for approval, including a single log", () => {
		const defs = createDiaryToolDefs(env);
		const log = defs.find((tool) => tool.name === "log_diary_food");
		const update = defs.find((tool) => tool.name === "update_diary_food");
		const voidTool = defs.find((tool) => tool.name === "void_diary_food");
		const save = defs.find(
			(tool) => tool.name === "save_diary_food_to_kitchen",
		);
		expect(log?.needsApproval).toBe(true);
		expect(update?.needsApproval).toBe(true);
		expect(voidTool?.needsApproval).toBe(true);
		expect(save?.needsApproval).toBe(true);
		expect(typeof log?.needsApproval).not.toBe("function");
	});

	it("refuses a kitchen save without confirm and writes nothing", async () => {
		const save = createDiaryToolDefs(env).find(
			(tool) => tool.name === "save_diary_food_to_kitchen",
		);
		if (!save) throw new Error("missing save tool");
		const result = await save.handler(env.__mcp, {
			confirm: false,
			target: "cargo",
			intakeId: "44444444-4444-4444-8444-444444444444",
			operationKey: "11111111-1111-4111-8111-111111111111",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid_input");
	});

	it("quotes zero credits and does not require a write", async () => {
		const quote = createDiaryToolDefs(env).find(
			(tool) => tool.name === "quote_food_log",
		);
		if (!quote) throw new Error("missing quote tool");
		const result = await quote.handler(env.__mcp, {});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toEqual({ credits: 0 });
	});
});
