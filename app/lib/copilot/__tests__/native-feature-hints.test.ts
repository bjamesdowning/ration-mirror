import { describe, expect, it } from "vitest";
import {
	detectNativeFeatureSuggestion,
	formatNativeFeatureAdvisory,
	resolveNativeFeatureLink,
} from "../native-feature-hints.server";

describe("detectNativeFeatureSuggestion", () => {
	it.each([
		["generate a recipe with lentils", "Galley Generate"],
		["plan my week", "Manifest Plan Week"],
	])("requires native-feature due diligence for %s", (input, name) => {
		expect(detectNativeFeatureSuggestion(input)?.name).toBe(name);
	});

	it.each([
		"generate a recipe in this chat",
		"plan my week through copilot",
		"just do it: create a pasta recipe",
		"continue here and plan the week",
	])("allows an explicit chat preference: %s", (input) => {
		expect(detectNativeFeatureSuggestion(input)).toBeNull();
	});

	it("does not intercept a meal-plan read", () => {
		expect(
			detectNativeFeatureSuggestion("what is on my meal plan?"),
		).toBeNull();
	});

	it("suppresses suggestions when the native AI flag is off", () => {
		expect(
			detectNativeFeatureSuggestion("generate a recipe with lentils", {
				"ai-generate-meal": false,
				"ai-plan-week": true,
			}),
		).toBeNull();
		expect(
			detectNativeFeatureSuggestion("plan my week", {
				"ai-generate-meal": true,
				"ai-plan-week": true,
			})?.name,
		).toBe("Manifest Plan Week");
	});
});

describe("resolveNativeFeatureLink", () => {
	it("uses webPath for web and deepLink for mobile", () => {
		const hint = {
			deepLink: "ration://galley/generate",
			webPath: "/hub/galley",
		};
		expect(resolveNativeFeatureLink(hint, "web")).toBe("/hub/galley");
		expect(resolveNativeFeatureLink(hint, "mobile")).toBe(
			"ration://galley/generate",
		);
	});
});

describe("formatNativeFeatureAdvisory", () => {
	it("is act-first and includes the platform link", () => {
		const suggestion = detectNativeFeatureSuggestion(
			"generate a recipe with lentils",
			{ "ai-generate-meal": true },
		);
		expect(suggestion).not.toBeNull();
		if (!suggestion) return;
		const advisory = formatNativeFeatureAdvisory(suggestion, "web");
		expect(advisory).toContain("MUST complete all requested actions");
		expect(advisory).toContain("Only after your final action summary");
		expect(advisory).toContain("/hub/galley");
		expect(advisory).not.toContain("Before acting");
	});
});
