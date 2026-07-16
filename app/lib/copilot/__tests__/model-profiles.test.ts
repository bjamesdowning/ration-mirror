import { describe, expect, it } from "vitest";
import {
	COPILOT_DEFAULT_MODEL_PRESET,
	COPILOT_MODEL_PRESETS,
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
	it("fast disables reasoning effort", () => {
		expect(COPILOT_MODEL_PRESETS.fast.reasoningEffort).toBeNull();
	});

	it("deep uses high reasoning effort", () => {
		expect(COPILOT_MODEL_PRESETS.deep.reasoningEffort).toBe("high");
	});

	it("deep allows longer multi-step tool runs", () => {
		expect(COPILOT_MODEL_PRESETS.deep.maxSteps).toBe(25);
		expect(COPILOT_MODEL_PRESETS.deep.maxOutputTokens).toBe(16384);
	});

	it("fast keeps a lower step and output budget", () => {
		expect(COPILOT_MODEL_PRESETS.fast.maxSteps).toBe(8);
		expect(COPILOT_MODEL_PRESETS.fast.maxOutputTokens).toBe(2048);
	});

	it("onboarding briefing forces fast preset", () => {
		expect(ONBOARDING_BRIEFING_MODEL_PRESET).toBe("fast");
	});
});
