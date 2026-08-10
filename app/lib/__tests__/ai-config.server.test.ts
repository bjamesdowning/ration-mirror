import { describe, expect, it } from "vitest";
import {
	AI_MODEL,
	GATEWAY_FEATURE_CONFIG,
	type GatewayFeature,
	getGenerationConfig,
	type ThinkingLevel,
} from "~/lib/ai-config.server";

describe("ai-config.server", () => {
	it("AI_MODEL is gemini-3.5-flash-lite", () => {
		expect(AI_MODEL).toBe("gemini-3.5-flash-lite");
	});

	it.each<[GatewayFeature, ThinkingLevel, number, string | undefined]>([
		["scan", "HIGH", 16_384, "MEDIA_RESOLUTION_HIGH"],
		["meal_generate", "MEDIUM", 8_192, undefined],
		["plan_week", "MEDIUM", 8_192, undefined],
		["import_url", "MINIMAL", 4_096, undefined],
		["nutrition_estimate", "MINIMAL", 1_024, undefined],
	])("GATEWAY_FEATURE_CONFIG[%s] profile: thinking=%s maxOutput=%s media=%s", (feature, thinking, maxOutput, media) => {
		const profile = GATEWAY_FEATURE_CONFIG[feature];
		expect(profile.thinkingLevel).toBe(thinking);
		expect(profile.maxOutputTokens).toBe(maxOutput);
		expect(profile.mediaResolution).toBe(media);
	});

	it("getGenerationConfig includes thinking, maxOutputTokens, and mediaResolution when set", () => {
		expect(getGenerationConfig(GATEWAY_FEATURE_CONFIG.scan)).toEqual({
			generationConfig: {
				thinkingConfig: {
					thinkingLevel: "HIGH",
					includeThoughts: false,
				},
				maxOutputTokens: 16_384,
				mediaResolution: "MEDIA_RESOLUTION_HIGH",
			},
		});
	});

	it("getGenerationConfig omits mediaResolution for text-only features", () => {
		expect(getGenerationConfig(GATEWAY_FEATURE_CONFIG.import_url)).toEqual({
			generationConfig: {
				thinkingConfig: {
					thinkingLevel: "MINIMAL",
					includeThoughts: false,
				},
				maxOutputTokens: 4_096,
			},
		});
		expect(
			getGenerationConfig(GATEWAY_FEATURE_CONFIG.nutrition_estimate),
		).toEqual({
			generationConfig: {
				thinkingConfig: {
					thinkingLevel: "MINIMAL",
					includeThoughts: false,
				},
				maxOutputTokens: 1_024,
			},
		});
	});

	it.each<ThinkingLevel>([
		"MINIMAL",
		"LOW",
		"MEDIUM",
		"HIGH",
	])("getGenerationConfig accepts thinking level %s via profile", (level) => {
		const config = getGenerationConfig({
			thinkingLevel: level,
			maxOutputTokens: 512,
		});
		expect(config.generationConfig.thinkingConfig.thinkingLevel).toBe(level);
		expect(config.generationConfig.maxOutputTokens).toBe(512);
		expect(config.generationConfig.mediaResolution).toBeUndefined();
	});
});
