import { describe, expect, it } from "vitest";
import { FeatureEnablementActionSchema } from "../feature-enablement";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

describe("FeatureEnablementActionSchema", () => {
	it("accepts set with both features on and affirmation", () => {
		const parsed = FeatureEnablementActionSchema.parse({
			action: "set",
			aiFeatures: true,
			macroTracking: true,
			affirmed: true,
			requestId: REQUEST_ID,
		});
		expect(parsed.action).toBe("set");
		if (parsed.action !== "set") throw new Error("expected set");
		expect(parsed.aiFeatures).toBe(true);
		expect(parsed.macroTracking).toBe(true);
	});

	it("accepts set with both features off without affirmation", () => {
		const parsed = FeatureEnablementActionSchema.parse({
			action: "set",
			aiFeatures: false,
			macroTracking: false,
			requestId: REQUEST_ID,
		});
		expect(parsed.action).toBe("set");
	});

	it("accepts enable / disable / erase", () => {
		expect(
			FeatureEnablementActionSchema.parse({
				action: "enable",
				feature: "ai",
				affirmed: true,
				requestId: REQUEST_ID,
			}).action,
		).toBe("enable");
		expect(
			FeatureEnablementActionSchema.parse({
				action: "disable",
				feature: "macro",
				requestId: REQUEST_ID,
			}).action,
		).toBe("disable");
		expect(
			FeatureEnablementActionSchema.parse({
				action: "erase",
				dataset: "all",
				requestId: REQUEST_ID,
			}).action,
		).toBe("erase");
	});

	it("rejects enable without affirmation", () => {
		expect(() =>
			FeatureEnablementActionSchema.parse({
				action: "enable",
				feature: "macro",
				affirmed: false,
				requestId: REQUEST_ID,
			}),
		).toThrow();
	});
});
