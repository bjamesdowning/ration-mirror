import { describe, expect, it } from "vitest";
import { MCP_TOOL_GROUPS } from "../agent-readiness";
import {
	COPILOT_TOOL_LABELS,
	copilotToolDoneLabel,
	copilotToolLabel,
} from "../copilot/tool-labels";

describe("copilot tool labels", () => {
	it("maps known tools to human copy", () => {
		expect(copilotToolLabel("list_inventory", "running")).toBe(
			"Checking your Cargo…",
		);
		expect(copilotToolLabel("list_inventory", "done")).toBe("Checked Cargo");
	});

	it("names net Supply lines on the sync card when the result has counts", () => {
		expect(copilotToolLabel("sync_supply_from_selected_meals", "done")).toBe(
			"Synced Supply from meals",
		);
		expect(
			copilotToolDoneLabel("sync_supply_from_selected_meals", {
				ok: true,
				data: {
					summary: { newLines: 3, removedLines: 1, changedLines: 2 },
				},
			}),
		).toBe("3 new, 1 removed, 2 changed");
		expect(copilotToolDoneLabel("list_inventory", { items: [] })).toBe(
			"Checked Cargo",
		);
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
