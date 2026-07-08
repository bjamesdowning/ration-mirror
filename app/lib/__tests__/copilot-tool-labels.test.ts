import { describe, expect, it } from "vitest";
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

	it("includes core copilot inventory tools", () => {
		expect(COPILOT_TOOL_LABELS.add_cargo_item).toBeDefined();
		expect(COPILOT_TOOL_LABELS.match_meals).toBeDefined();
	});
});
