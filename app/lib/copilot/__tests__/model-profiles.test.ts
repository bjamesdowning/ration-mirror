import { describe, expect, it } from "vitest";
import {
	COPILOT_DEFAULT_MODEL_ID,
	COPILOT_DEFAULT_MODEL_PRESET,
	COPILOT_MODEL_PRESETS,
	ONBOARDING_BRIEFING_MODEL_PRESET,
	parseCopilotModelPreset,
	resolveCopilotModelId,
	resolveCopilotModelPreset,
	workersAiProviderOptions,
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
	it("defaults to gpt-oss-120b on Workers AI", () => {
		expect(COPILOT_DEFAULT_MODEL_ID).toBe("@cf/openai/gpt-oss-120b");
		expect(resolveCopilotModelId({})).toBe("@cf/openai/gpt-oss-120b");
		expect(resolveCopilotModelId({ COPILOT_MODEL_ID: " minimax/m3 " })).toBe(
			"minimax/m3",
		);
	});

	it("fast omits reasoning_effort", () => {
		expect(COPILOT_MODEL_PRESETS.fast.reasoningEffort).toBeNull();
		expect(workersAiProviderOptions(COPILOT_MODEL_PRESETS.fast)).toEqual({
			"workers-ai": {},
		});
	});

	it("deep sets high reasoning_effort for gpt-oss", () => {
		expect(COPILOT_MODEL_PRESETS.deep.reasoningEffort).toBe("high");
		expect(workersAiProviderOptions(COPILOT_MODEL_PRESETS.deep)).toEqual({
			"workers-ai": { reasoning_effort: "high" },
		});
	});

	it("deep allows longer multi-step tool runs", () => {
		expect(COPILOT_MODEL_PRESETS.deep.maxSteps).toBe(25);
		expect(COPILOT_MODEL_PRESETS.deep.maxOutputTokens).toBe(16384);
	});

	it("fast keeps a lower step and output budget", () => {
		expect(COPILOT_MODEL_PRESETS.fast.maxSteps).toBe(12);
		expect(COPILOT_MODEL_PRESETS.fast.maxOutputTokens).toBe(2048);
	});

	it("onboarding briefing forces fast preset", () => {
		expect(ONBOARDING_BRIEFING_MODEL_PRESET).toBe("fast");
	});
});
