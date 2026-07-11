import { describe, expect, it } from "vitest";
import { MCP_TOOL_GROUPS } from "../agent-readiness";
import { COPILOT_TOOL_LABELS, copilotToolLabel } from "../copilot/tool-labels";

describe("copilot tool labels", () => {
	it("maps known tools to human copy", () => {
		expect(copilotToolLabel("list_inventory", "running")).toBe(
			"Checking your Cargo…",
		);
		expect(copilotToolLabel("list_inventory", "done")).toBe("Checked Cargo");
	});

	it("falls back for unknown tools", () => {
		expect(copilotToolLabel("unknown_tool", "running")).toBe("Working on it…");
	});

	it("includes every Copilot tool", () => {
		const expected = [
			"search_docs",
			...MCP_TOOL_GROUPS.flatMap((group) => [...group.tools]),
		].sort();

		expect(Object.keys(COPILOT_TOOL_LABELS).sort()).toEqual(expected);
	});
});
