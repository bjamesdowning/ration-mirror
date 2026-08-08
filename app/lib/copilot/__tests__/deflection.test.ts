import { describe, expect, it } from "vitest";
import {
	COPILOT_DEFLECTION_NUDGE,
	detectCopilotDeflection,
	hasWriteTools,
	isActionableUserText,
} from "../deflection.server";

describe("detectCopilotDeflection", () => {
	it("detects zero-tool actionable turns with write tools", () => {
		expect(
			detectCopilotDeflection({
				toolCallCount: 0,
				activeTools: ["list_inventory", "create_meal", "add_cargo_item"],
				userText: "Create a meal plan and fill inventory",
				nativeSuggestionMatched: true,
			}),
		).toBe(true);
	});

	it("detects action verbs even without native suggestion", () => {
		expect(
			detectCopilotDeflection({
				toolCallCount: 0,
				activeTools: ["create_meal"],
				userText: "add a pasta recipe",
				nativeSuggestionMatched: false,
			}),
		).toBe(true);
	});

	it("ignores turns that called tools", () => {
		expect(
			detectCopilotDeflection({
				toolCallCount: 2,
				activeTools: ["create_meal"],
				userText: "create a meal",
				nativeSuggestionMatched: true,
			}),
		).toBe(false);
	});

	it("ignores read-only tool surfaces", () => {
		expect(
			detectCopilotDeflection({
				toolCallCount: 0,
				activeTools: ["list_inventory", "get_kitchen_summary"],
				userText: "create a meal",
				nativeSuggestionMatched: false,
			}),
		).toBe(false);
	});

	it("ignores non-actionable questions", () => {
		expect(
			detectCopilotDeflection({
				toolCallCount: 0,
				activeTools: ["create_meal"],
				userText: "what's in my pantry?",
				nativeSuggestionMatched: false,
			}),
		).toBe(false);
	});
});

describe("hasWriteTools / isActionableUserText", () => {
	it("recognizes write prefixes", () => {
		expect(hasWriteTools(["create_meal", "list_inventory"])).toBe(true);
		expect(hasWriteTools(["list_inventory"])).toBe(false);
	});

	it("recognizes action verbs", () => {
		expect(isActionableUserText("please create dinners")).toBe(true);
		expect(isActionableUserText("what expires soon?")).toBe(false);
	});

	it("exports a nudge string", () => {
		expect(COPILOT_DEFLECTION_NUDGE).toContain("proceed with tools now");
	});
});
