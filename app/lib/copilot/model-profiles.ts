import { z } from "zod";

export type CopilotModelPreset = "fast" | "deep";

/** gpt-oss Responses API reasoning effort (`reasoning.effort` / workers-ai `reasoning_effort`). */
export type CopilotReasoningEffort = "low" | "medium" | "high" | null;

export type CopilotModelProfile = {
	label: string;
	description: string;
	/** Omit when null — Fast leaves default model reasoning; Deep forces high effort. */
	reasoningEffort: CopilotReasoningEffort;
	maxOutputTokens: number;
	maxSteps: number;
	temperature: number;
	topP: number;
};

/**
 * Fast / Deep presets for `@cf/openai/gpt-oss-120b` via Workers AI.
 * Deep sets `providerOptions["workers-ai"].reasoning_effort = "high"`.
 * `sendReasoning: true` surfaces reasoning parts in the Show thinking UI.
 */
export const COPILOT_MODEL_PRESETS: Record<
	CopilotModelPreset,
	CopilotModelProfile
> = {
	fast: {
		label: "Fast",
		description: "Quick answers, lower token use",
		reasoningEffort: null,
		maxOutputTokens: 2048,
		maxSteps: 12,
		temperature: 0.3,
		topP: 0.9,
	},
	deep: {
		label: "Deep",
		description: "Better multi-step planning, uses more tokens",
		reasoningEffort: "high",
		maxOutputTokens: 16384,
		maxSteps: 25,
		temperature: 0.5,
		topP: 0.95,
	},
};

export const COPILOT_DEFAULT_MODEL_PRESET: CopilotModelPreset = "fast";

/** Forced model preset for iOS onboarding briefing turns. */
export const ONBOARDING_BRIEFING_MODEL_PRESET: CopilotModelPreset = "fast";

/**
 * Workers AI model id for Copilot (Cloudflare-hosted, Workers AI billing).
 * Override with `COPILOT_MODEL_ID` if needed.
 * @see https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
 */
export const COPILOT_DEFAULT_MODEL_ID = "@cf/openai/gpt-oss-120b";

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

export function resolveCopilotModelId(env: {
	COPILOT_MODEL_ID?: string;
}): string {
	return env.COPILOT_MODEL_ID?.trim() || COPILOT_DEFAULT_MODEL_ID;
}

/** Build workers-ai providerOptions for a Fast/Deep profile. */
export function workersAiProviderOptions(profile: CopilotModelProfile): {
	"workers-ai": Record<string, unknown>;
} {
	const workersAiOptions: Record<string, unknown> = {};
	if (profile.reasoningEffort !== null) {
		workersAiOptions.reasoning_effort = profile.reasoningEffort;
	}
	return { "workers-ai": workersAiOptions };
}
