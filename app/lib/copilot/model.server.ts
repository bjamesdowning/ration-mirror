import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { google } from "workers-ai-provider/google";
import { openai } from "workers-ai-provider/openai";
import { COPILOT_GEMINI_MODEL_ID } from "./model-profiles";

export class CopilotGatewayUnconfiguredError extends Error {
	constructor() {
		super("copilot_gateway_unconfigured");
		this.name = "CopilotGatewayUnconfiguredError";
	}
}

export type CopilotGatewayEnv = {
	AI: Ai;
	AI_GATEWAY_ID?: string;
	RATION_ENV?: string;
};

/**
 * Think LanguageModel for Copilot: Gemini 3.7 Flash through ration-gateway.
 * Returns a LanguageModel (not a string) so Think does not fall back to its
 * default openai/anthropic provider on the account "default" gateway.
 *
 * Both plugins are required: the default `env.AI.run` catalog path emits
 * OpenAI Chat Completions bytes for `google/…`, so the openai plugin parses
 * the stream. The google plugin covers the native gateway path (thoughts).
 */
export function createCopilotGatewayModel(
	env: CopilotGatewayEnv,
): LanguageModel {
	const gatewayId = env.AI_GATEWAY_ID?.trim();
	if (!gatewayId) {
		throw new CopilotGatewayUnconfiguredError();
	}

	const workersai = createWorkersAI({
		binding: env.AI,
		providers: [openai, google],
		gateway: {
			id: gatewayId,
			skipCache: true,
			retries: { maxAttempts: 1 },
			metadata: {
				feature: "copilot",
				env: env.RATION_ENV?.trim() || "unknown",
			},
		},
	});

	return workersai(COPILOT_GEMINI_MODEL_ID);
}
