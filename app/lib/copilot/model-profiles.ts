import { z } from "zod";

export type CopilotModelPreset = "fast" | "deep";

/** Gemini 3.7 Flash thinking levels. `minimal` is a 400 on this model. */
export type CopilotThinkingLevel = "low" | "high";

export type CopilotModelProfile = {
	label: string;
	description: string;
	thinkingLevel: CopilotThinkingLevel;
	maxOutputTokens: number;
	maxSteps: number;
	/** Think stream-stall watchdog for this preset (ms). */
	stallTimeoutMs: number;
};

/**
 * Fast / Deep presets for `google/gemini-3.7-flash` via AI Gateway.
 * Deep uses `thinkingLevel: "high"`; Fast uses `"low"`.
 * `includeThoughts` + Think `sendReasoning` surface the Show thinking UI.
 */
export const COPILOT_MODEL_PRESETS: Record<
	CopilotModelPreset,
	CopilotModelProfile
> = {
	fast: {
		label: "Fast",
		description: "Quick answers, lower token use",
		thinkingLevel: "low",
		maxOutputTokens: 8192,
		maxSteps: 8,
		stallTimeoutMs: 45_000,
	},
	deep: {
		label: "Deep",
		description: "Better multi-step planning, uses more tokens",
		thinkingLevel: "high",
		maxOutputTokens: 16384,
		maxSteps: 16,
		stallTimeoutMs: 90_000,
	},
};

export const COPILOT_DEFAULT_MODEL_PRESET: CopilotModelPreset = "fast";

/** Forced model preset for iOS onboarding briefing turns. */
export const ONBOARDING_BRIEFING_MODEL_PRESET: CopilotModelPreset = "fast";

/**
 * Hardcoded Copilot catalog slug — Gemini 3.7 Flash on ration-gateway.
 * @see https://developers.cloudflare.com/ai/models/google/gemini-3.7-flash/
 */
export const COPILOT_GEMINI_MODEL_ID = "google/gemini-3.7-flash";

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

export type GoogleThinkingProviderOptions = {
	google: {
		thinkingConfig: {
			thinkingLevel: CopilotThinkingLevel;
			includeThoughts: true;
		};
	};
};

/** Build Google providerOptions for a Fast/Deep profile. */
export function googleThinkingProviderOptions(
	profile: CopilotModelProfile,
): GoogleThinkingProviderOptions {
	return {
		google: {
			thinkingConfig: {
				thinkingLevel: profile.thinkingLevel,
				includeThoughts: true,
			},
		},
	};
}

export type CopilotTurnInference = {
	maxSteps: number;
	maxOutputTokens: number;
	sendReasoning: true;
	providerOptions: GoogleThinkingProviderOptions;
	chatStreamStallTimeoutMs: number;
};

/** Turn knobs shared by Ask and onboarding (override maxSteps/tokens at the call site). */
export function copilotTurnInference(
	profile: CopilotModelProfile,
): CopilotTurnInference {
	return {
		maxSteps: profile.maxSteps,
		maxOutputTokens: profile.maxOutputTokens,
		sendReasoning: true,
		providerOptions: googleThinkingProviderOptions(profile),
		chatStreamStallTimeoutMs: profile.stallTimeoutMs,
	};
}
