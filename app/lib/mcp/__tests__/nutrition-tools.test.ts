import { describe, expect, it, vi } from "vitest";
import { createNutritionToolDefs } from "../tools/nutrition";

vi.mock("~/lib/nutrition/persist.server", () => ({
	buildMinimalFlagContext: vi.fn(() => ({ environment: "test" })),
	getNutritionSummary: vi.fn(),
	upsertNutritionGoal: vi.fn(),
	clearNutritionGoal: vi.fn(),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));

describe("createNutritionToolDefs", () => {
	it("registers the three nutrition tools", () => {
		const defs = createNutritionToolDefs({} as never);
		expect(defs.map((d) => d.name).sort()).toEqual([
			"clear_nutrition_goal",
			"get_nutrition_summary",
			"set_nutrition_goal",
		]);
	});

	it("returns feature_disabled when flags are off", async () => {
		const defs = createNutritionToolDefs({} as never);
		const summary = defs.find((d) => d.name === "get_nutrition_summary");
		if (!summary) throw new Error("expected get_nutrition_summary");
		const envelope = await summary.handler(
			{
				organizationId: "org-1",
				userId: "user-1",
				scopes: ["mcp:read"],
				preClaim: false,
				authMethod: "oauth",
				apiKeyId: "k1",
				keyName: "test",
				keyPrefix: "t_",
			},
			{ from: "2026-08-01", to: "2026-08-07" },
		);
		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;
		expect(envelope.error.code).toBe("feature_disabled");
		expect(envelope.error.recoveryHint).toBeTruthy();
	});
});
