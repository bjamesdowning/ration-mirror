import { z } from "zod";

export type CopilotModelPreset = "fast" | "deep";

export type CopilotModelProfile = {
	label: string;
	description: string;
	maxOutputTokens: number;
	maxSteps: number;
	temperature: number;
	topP: number;
};

/**
 * Fast / Deep are Ration presets on the same Cloudflare Workers AI model
 * (`minimax/m3`). Cloudflare's published Chat Completions schema does not
 * document MiniMax `thinking` — differentiate via steps, output budget, and
 * sampling only. `sendReasoning: true` still surfaces any `reasoning_content`
 * Cloudflare returns.
 */
export const COPILOT_MODEL_PRESETS: Record<
	CopilotModelPreset,
	CopilotModelProfile
> = {
	fast: {
		label: "Fast",
		description: "Quick answers, lower token use",
		maxOutputTokens: 2048,
		maxSteps: 12,
		temperature: 0.3,
		topP: 0.9,
	},
	deep: {
		label: "Deep",
		description: "Better multi-step planning, uses more tokens",
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
 * Workers AI / AI REST model id for Copilot (Cloudflare-billed).
 * Override with `COPILOT_MODEL_ID` (e.g. rollback to `@cf/openai/gpt-oss-120b`).
 * @see https://developers.cloudflare.com/ai/models/minimax/m3/
 */
export const COPILOT_DEFAULT_MODEL_ID = "minimax/m3";

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
