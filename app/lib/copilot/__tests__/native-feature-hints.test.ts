import { describe, expect, it } from "vitest";
import {
	detectNativeFeatureSuggestion,
	formatNativeFeatureGuidance,
	resolveNativeFeatureLink,
} from "../native-feature-hints.server";

describe("detectNativeFeatureSuggestion", () => {
	it("does not upsell Galley Generate or Plan Week", () => {
		expect(
			detectNativeFeatureSuggestion("generate a recipe with lentils"),
		).toBeNull();
		expect(detectNativeFeatureSuggestion("plan my week")).toBeNull();
	});

	it("does not intercept a meal-plan read", () => {
		expect(
			detectNativeFeatureSuggestion("what is on my meal plan?"),
		).toBeNull();
	});
});

describe("resolveNativeFeatureLink", () => {
	it("uses webPath for web and deepLink for mobile", () => {
		const hint = {
			deepLink: "ration://galley/import",
			webPath: "/hub/galley",
		};
		expect(resolveNativeFeatureLink(hint, "web")).toBe("/hub/galley");
		expect(resolveNativeFeatureLink(hint, "mobile")).toBe(
			"ration://galley/import",
		);
	});
});

describe("formatNativeFeatureGuidance", () => {
	it("lists only Scan and Galley Import", () => {
		const guidance = formatNativeFeatureGuidance({
			"ai-scan-receipt": true,
			"ai-import-url": true,
		});
		expect(guidance).toContain("Scan");
		expect(guidance).toContain("Galley Import");
		expect(guidance).not.toContain("Galley Generate");
		expect(guidance).not.toContain("Plan Week");
	});
});
