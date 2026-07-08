import { describe, expect, it } from "vitest";
import { resolveCopilotActivityDisplay } from "../copilot/activity-display";

describe("resolveCopilotActivityDisplay", () => {
	it("returns hidden for idle and streaming", () => {
		expect(resolveCopilotActivityDisplay("idle", null, null)).toEqual({
			kind: "hidden",
		});
		expect(resolveCopilotActivityDisplay("streaming", null, null)).toEqual({
			kind: "hidden",
		});
	});

	it("returns thinking for connecting and thinking phases", () => {
		expect(resolveCopilotActivityDisplay("connecting", null, null)).toEqual({
			kind: "thinking",
		});
		expect(resolveCopilotActivityDisplay("thinking", null, null)).toEqual({
			kind: "thinking",
		});
	});

	it("returns running tool label", () => {
		expect(
			resolveCopilotActivityDisplay("tool_running", "list_inventory", null),
		).toEqual({
			kind: "tool",
			label: "Checking your Cargo…",
			running: true,
			succeeded: null,
		});
	});

	it("returns done tool label with success state", () => {
		expect(
			resolveCopilotActivityDisplay("tool_done", "list_inventory", true),
		).toEqual({
			kind: "tool",
			label: "Checked Cargo",
			running: false,
			succeeded: true,
		});
	});

	it("returns error tool label when tool failed", () => {
		expect(
			resolveCopilotActivityDisplay("tool_done", "list_inventory", false),
		).toMatchObject({
			kind: "tool",
			label: "Cargo lookup failed",
			running: false,
			succeeded: false,
		});
	});
});
