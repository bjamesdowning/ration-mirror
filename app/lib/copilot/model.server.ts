import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import {
	COPILOT_DEFAULT_BASE_URL,
	COPILOT_DEFAULT_MODEL_ID,
	type CopilotThinkingType,
} from "./model-profiles";

type CopilotModelEnv = {
	MINIMAX_API_KEY?: string;
	COPILOT_MODEL_ID?: string;
	COPILOT_BASE_URL?: string;
};

export type MiniMaxRequestExtras = {
	thinking: { type: CopilotThinkingType };
	reasoning_split: boolean;
};

/**
 * OpenAI-compatible MiniMax transport so Fast/Deep can pass `thinking` /
 * `reasoning_split` (not available on Cloudflare's published minimax/m3 schema).
 *
 * Secrets: `MINIMAX_API_KEY` (or AI Gateway BYOK via COPILOT_BASE_URL).
 * Optional: `COPILOT_MODEL_ID` (default MiniMax-M3), `COPILOT_BASE_URL`
 * (default https://api.minimax.io/v1 — set to an AI Gateway compat URL to proxy).
 */
export function createCopilotLanguageModel(
	env: CopilotModelEnv,
	getExtras: () => MiniMaxRequestExtras,
): LanguageModel {
	const apiKey = env.MINIMAX_API_KEY?.trim();
	if (!apiKey) {
		throw new Error(
			"MINIMAX_API_KEY is required for Copilot (MiniMax OpenAI-compatible transport).",
		);
	}
	const baseURL = env.COPILOT_BASE_URL?.trim() || COPILOT_DEFAULT_BASE_URL;
	const modelId = env.COPILOT_MODEL_ID?.trim() || COPILOT_DEFAULT_MODEL_ID;
	const provider = createOpenAI({
		apiKey,
		baseURL,
		name: "minimax",
		fetch: async (input, init) => {
			const extras = getExtras();
			if (init?.body && typeof init.body === "string") {
				try {
					const body = JSON.parse(init.body) as Record<string, unknown>;
					// MiniMax does not accept OpenAI reasoning_effort — strip if present.
					delete body.reasoning_effort;
					body.thinking = extras.thinking;
					body.reasoning_split = extras.reasoning_split;
					return fetch(input, {
						...init,
						body: JSON.stringify(body),
					});
				} catch {
					// Fall through with original body if parse fails.
				}
			}
			return fetch(input, init);
		},
	});
	return provider.chat(modelId);
}
