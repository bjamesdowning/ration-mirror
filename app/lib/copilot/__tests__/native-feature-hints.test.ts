import { describe, expect, it } from "vitest";
import { detectNativeFeatureSuggestion } from "../native-feature-hints.server";

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
