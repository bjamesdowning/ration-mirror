import { describe, expect, it } from "vitest";
import { MCP_TOOL_GROUPS } from "~/lib/agent-readiness";
import type { McpToolsEnv } from "~/lib/mcp/tool-runtime";
import { createMockEnv } from "~/test/helpers/mock-env";
import {
	buildCopilotMcpContext,
	COPILOT_MCP_SCOPES,
	createCopilotToolDefs,
	toAiSdkTools,
} from "../tools.server";

describe("createCopilotToolDefs", () => {
	function makeEnv(): McpToolsEnv {
		return {
			...createMockEnv(),
			__mcp: buildCopilotMcpContext({
				organizationId: "org-test-123",
				userId: "user-test-123",
				scopes: [...COPILOT_MCP_SCOPES],
				preClaim: false,
			}),
		} as McpToolsEnv;
	}

	it("exposes every MCP tool plus search_docs without drift", () => {
		const names = createCopilotToolDefs(makeEnv()).map(
			(definition) => definition.name,
		);
		const mcpNames = MCP_TOOL_GROUPS.flatMap((group) => [...group.tools]);

		expect(names.filter((name) => name !== "search_docs").sort()).toEqual(
			mcpNames.sort(),
		);
		expect(names.filter((name) => name === "search_docs")).toHaveLength(1);
		expect(new Set(names).size).toBe(names.length);
	});

	it("preserves strict schemas used by both transports", () => {
		const definitions = new Map(
			createCopilotToolDefs(makeEnv()).map((definition) => [
				definition.name,
				definition,
			]),
		);

		expect(
			definitions
				.get("search_ingredients")
				?.inputSchema.safeParse({ query: "" }).success,
		).toBe(false);
		expect(
			definitions.get("add_cargo_item")?.inputSchema.safeParse({
				name: "Milk",
				quantity: 1,
				unit: "",
			}).success,
		).toBe(false);
	});

	it("requires approval for destructive and high-impact tools", async () => {
		const definitions = new Map(
			createCopilotToolDefs(makeEnv()).map((definition) => [
				definition.name,
				definition,
			]),
		);
		const alwaysApproved = [
			"remove_cargo_item",
			"apply_inventory_import",
			"import_inventory_csv",
			"delete_meal",
			"clear_active_meals",
			"bulk_add_meal_plan_entries",
			"complete_supply_list",
		];

		for (const name of alwaysApproved) {
			expect(definitions.get(name)?.needsApproval).toBe(true);
		}
		const consumeApproval = definitions.get("consume_meal")?.needsApproval;
		expect(typeof consumeApproval).toBe("function");
		if (typeof consumeApproval === "function") {
			expect(await consumeApproval({ mealId: crypto.randomUUID() })).toBe(
				false,
			);
			expect(
				await consumeApproval({
					mealId: crypto.randomUUID(),
					confirmInsufficient: true,
				}),
			).toBe(true);
		}
	});

	it("passes approval policy into the AI SDK adapter", () => {
		const env = createMockEnv() as Cloudflare.Env;
		const tools = toAiSdkTools(env, {
			organizationId: "org-test-123",
			userId: "user-test-123",
			scopes: [...COPILOT_MCP_SCOPES],
			preClaim: false,
		});

		expect(tools.remove_cargo_item?.needsApproval).toBe(true);
		expect(tools.add_cargo_item?.needsApproval).toBeUndefined();
	});
});
