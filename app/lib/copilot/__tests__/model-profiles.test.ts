import { describe, expect, it } from "vitest";
import { ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS } from "../constants";
import {
	COPILOT_DEFAULT_MODEL_PRESET,
	COPILOT_GEMINI_MODEL_ID,
	COPILOT_MODEL_PRESETS,
	copilotTurnInference,
	googleThinkingProviderOptions,
	ONBOARDING_BRIEFING_MODEL_PRESET,
	parseCopilotModelPreset,
	resolveCopilotModelPreset,
} from "../model-profiles";

describe("parseCopilotModelPreset", () => {
	it("accepts fast and deep", () => {
		expect(parseCopilotModelPreset("fast")).toBe("fast");
		expect(parseCopilotModelPreset("deep")).toBe("deep");
	});

	it("rejects invalid values", () => {
		expect(parseCopilotModelPreset("medium")).toBeNull();
		expect(parseCopilotModelPreset(null)).toBeNull();
		expect(parseCopilotModelPreset(undefined)).toBeNull();
	});
});

describe("resolveCopilotModelPreset", () => {
	it("prefers body preset over cache", () => {
		expect(resolveCopilotModelPreset("deep", "fast")).toBe("deep");
	});

	it("falls back to cache then default", () => {
		expect(resolveCopilotModelPreset(undefined, "deep")).toBe("deep");
		expect(resolveCopilotModelPreset(null, undefined)).toBe(
			COPILOT_DEFAULT_MODEL_PRESET,
		);
	});
});

describe("COPILOT_MODEL_PRESETS", () => {
	it("hardcodes Gemini 3.7 Flash", () => {
		expect(COPILOT_GEMINI_MODEL_ID).toBe("google/gemini-3.7-flash");
	});

	it("fast uses low thinking with thought summaries", () => {
		expect(COPILOT_MODEL_PRESETS.fast.thinkingLevel).toBe("low");
		expect(googleThinkingProviderOptions(COPILOT_MODEL_PRESETS.fast)).toEqual({
			google: {
				thinkingConfig: { thinkingLevel: "low", includeThoughts: true },
			},
		});
		expect(copilotTurnInference(COPILOT_MODEL_PRESETS.fast)).toMatchObject({
			sendReasoning: true,
			maxSteps: 8,
			maxOutputTokens: 8192,
			chatStreamStallTimeoutMs: 45_000,
		});
	});

	it("deep uses high thinking with thought summaries", () => {
		expect(COPILOT_MODEL_PRESETS.deep.thinkingLevel).toBe("high");
		expect(googleThinkingProviderOptions(COPILOT_MODEL_PRESETS.deep)).toEqual({
			google: {
				thinkingConfig: { thinkingLevel: "high", includeThoughts: true },
			},
		});
		expect(copilotTurnInference(COPILOT_MODEL_PRESETS.deep)).toMatchObject({
			sendReasoning: true,
			maxSteps: 16,
			maxOutputTokens: 16384,
			chatStreamStallTimeoutMs: 90_000,
		});
	});

	it("does not emit workers-ai reasoning_effort", () => {
		const fast = googleThinkingProviderOptions(COPILOT_MODEL_PRESETS.fast);
		const deep = googleThinkingProviderOptions(COPILOT_MODEL_PRESETS.deep);
		expect(fast).not.toHaveProperty("workers-ai");
		expect(deep).not.toHaveProperty("workers-ai");
	});

	it("onboarding briefing forces fast preset with matching output budget", () => {
		expect(ONBOARDING_BRIEFING_MODEL_PRESET).toBe("fast");
		expect(ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS).toBe(
			COPILOT_MODEL_PRESETS.fast.maxOutputTokens,
		);
	});
});
