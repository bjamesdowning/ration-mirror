import { describe, expect, it } from "vitest";
import { detectBlockedCopilotIntent } from "../copilot/intent-guard.server";

describe("detectBlockedCopilotIntent", () => {
	it.each([
		["scan this receipt", "scan", "ration://scan"],
		[
			"generate a meal with chicken",
			"generate_meal",
			"ration://galley/generate",
		],
		[
			"import this recipe url https://example.com",
			"import_url",
			"ration://galley/import",
		],
		["plan my week", "plan_week", "ration://manifest/plan-week"],
	])("blocks %s", (input, feature, deepLink) => {
		const blocked = detectBlockedCopilotIntent(input);
		expect(blocked?.feature).toBe(feature);
		expect(blocked?.deepLink).toBe(deepLink);
	});

	it("allows deterministic pantry edits", () => {
		expect(detectBlockedCopilotIntent("add milk to cargo")).toBeNull();
	});
});
