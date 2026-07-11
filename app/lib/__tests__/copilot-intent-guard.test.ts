import { describe, expect, it } from "vitest";
import { detectBlockedCopilotIntent } from "../copilot/intent-guard.server";

describe("detectBlockedCopilotIntent", () => {
	it.each([
		["scan this receipt", "scan", "ration://scan"],
		[
			"import this recipe url https://example.com",
			"import_url",
			"ration://galley/import",
		],
	])("blocks %s", (input, feature, deepLink) => {
		const blocked = detectBlockedCopilotIntent(input);
		expect(blocked?.feature).toBe(feature);
		expect(blocked?.deepLink).toBe(deepLink);
	});

	it.each([
		"add milk to cargo",
		"generate a meal with chicken",
		"create a recipe for pasta",
		"plan my week",
		"what's on my meal plan",
	])("allows tool-backed request: %s", (input) => {
		expect(detectBlockedCopilotIntent(input)).toBeNull();
	});
});
