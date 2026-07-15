import { z } from "zod";

export type CopilotModelPreset = "fast" | "deep";

export type CopilotReasoningEffort = "low" | "medium" | "high" | null;

export type CopilotModelProfile = {
	label: string;
	description: string;
	reasoningEffort: CopilotReasoningEffort;
	maxOutputTokens: number;
	maxSteps: number;
	temperature: number;
	topP: number;
};

export const COPILOT_MODEL_PRESETS: Record<
	CopilotModelPreset,
	CopilotModelProfile
> = {
	fast: {
		label: "Fast",
		description: "Quick answers, lower token use",
		reasoningEffort: null,
		maxOutputTokens: 2048,
		maxSteps: 8,
		temperature: 0.3,
		topP: 0.9,
	},
	deep: {
		label: "Deep",
		description: "Better multi-step planning, uses more tokens",
		reasoningEffort: "high",
		maxOutputTokens: 4096,
		maxSteps: 10,
		temperature: 0.5,
		topP: 0.95,
	},
};

export const COPILOT_DEFAULT_MODEL_PRESET: CopilotModelPreset = "fast";

/** Forced model preset for iOS onboarding briefing turns. */
export const ONBOARDING_BRIEFING_MODEL_PRESET: CopilotModelPreset = "deep";

export const CopilotModelPresetSchema = z.enum(["fast", "deep"]);

export function parseCopilotModelPreset(
	value: unknown,
): CopilotModelPreset | null {
	const parsed = CopilotModelPresetSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export function resolveCopilotModelPreset(
	bodyPreset: unknown,
	cachedPreset: CopilotModelPreset | undefined,
): CopilotModelPreset {
	return (
		parseCopilotModelPreset(bodyPreset) ??
		cachedPreset ??
		COPILOT_DEFAULT_MODEL_PRESET
	);
}
