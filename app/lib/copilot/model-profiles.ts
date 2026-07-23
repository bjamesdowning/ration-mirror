import { z } from "zod";

export type CopilotModelPreset = "fast" | "deep";

/** MiniMax M3 thinking control (OpenAI-compatible `thinking.type`). */
export type CopilotThinkingType = "disabled" | "adaptive";

export type CopilotModelProfile = {
	label: string;
	description: string;
	/** MiniMax thinking mode — omit reasoning_effort (not a MiniMax field). */
	thinking: CopilotThinkingType;
	/** Keep reasoning_content shaped for Show thinking UI when thinking is on. */
	reasoningSplit: boolean;
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
		description: "Quick answers, thinking off, lower token use",
		thinking: "disabled",
		reasoningSplit: true,
		maxOutputTokens: 2048,
		maxSteps: 12,
		temperature: 0.3,
		topP: 0.9,
	},
	deep: {
		label: "Deep",
		description: "Adaptive thinking, better multi-step planning",
		thinking: "adaptive",
		reasoningSplit: true,
		maxOutputTokens: 16384,
		maxSteps: 25,
		temperature: 0.5,
		topP: 0.95,
	},
};

export const COPILOT_DEFAULT_MODEL_PRESET: CopilotModelPreset = "fast";

/** Forced model preset for iOS onboarding briefing turns. */
export const ONBOARDING_BRIEFING_MODEL_PRESET: CopilotModelPreset = "fast";

/** Default MiniMax model id (OpenAI-compatible API). Override with COPILOT_MODEL_ID. */
export const COPILOT_DEFAULT_MODEL_ID = "MiniMax-M3";

/** Direct MiniMax OpenAI-compatible base URL. Override with COPILOT_BASE_URL (e.g. AI Gateway). */
export const COPILOT_DEFAULT_BASE_URL = "https://api.minimax.io/v1";

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

/** Provider extras for MiniMax OpenAI-compatible chat completions. */
export function minimaxProviderOptions(profile: CopilotModelProfile): {
	thinking: { type: CopilotThinkingType };
	reasoning_split: boolean;
} {
	return {
		thinking: { type: profile.thinking },
		reasoning_split: profile.reasoningSplit,
	};
}
