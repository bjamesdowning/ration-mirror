import { describe, expect, it } from "vitest";
import {
	buildNutritionRecomputeWake,
	mealNutritionJobKey,
	orgNutritionJobKey,
} from "../recompute-outbox.server";

describe("nutrition recompute outbox helpers", () => {
	it("builds stable job keys", () => {
		expect(mealNutritionJobKey("m1")).toBe("meal:m1");
		expect(orgNutritionJobKey("o1")).toBe("org:o1");
	});

	it("builds wake messages without tenant fields", () => {
		const wake = buildNutritionRecomputeWake(
			"meal:m1",
			new Date("2026-08-09T12:00:00.000Z"),
		);
		expect(wake).toEqual({
			schemaVersion: 1,
			type: "nutrition.recompute.wake",
			jobKey: "meal:m1",
			sentAt: "2026-08-09T12:00:00.000Z",
		});
		expect(wake).not.toHaveProperty("organizationId");
		expect(wake).not.toHaveProperty("userId");
	});
});
