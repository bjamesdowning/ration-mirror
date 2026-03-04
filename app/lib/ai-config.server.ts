/**
 * Centralized AI model and generation config for Gemini via AI Gateway.
 * Thinking levels are applied per feature (scan, meal-generate, import-url, plan-week).
 */
export const AI_MODEL = "gemini-3.1-flash-lite-preview";

export type ThinkingLevel = "LOW" | "MEDIUM" | "HIGH";

export interface GenerationConfigWithThinking {
	generationConfig: {
		thinkingConfig: {
			thinkingLevel: ThinkingLevel;
			includeThoughts: false;
		};
	};
}

/**
 * Returns generationConfig for Gemini generateContent requests.
 * Pass the thinking level for the feature; omit to use MEDIUM.
 */
export function getGenerationConfig(
	thinkingLevel: ThinkingLevel,
): GenerationConfigWithThinking {
	return {
		generationConfig: {
			thinkingConfig: {
				thinkingLevel,
				includeThoughts: false,
			},
		},
	};
}
