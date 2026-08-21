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
 * Per-call options that pin Copilot onto google-ai-studio BYOK.
 *
 * Default catalog `env.AI.run` is Unified Billing. With no prepaid gateway
 * credits that returns "Insufficient balance; add money to your gateway or
 * use BYOK". Native gateway transport uses the stored Google key (same as
 * scan) and is the path that honors `providerOptions.google.thinkingConfig`.
 */
export const COPILOT_GATEWAY_MODEL_OPTIONS = {
	transport: "gateway" as const,
	skipCache: true,
};

/**
 * Think LanguageModel for Copilot: Gemini 3.7 Flash through ration-gateway.
 * Returns a LanguageModel (not a string) so Think does not fall back to its
 * default openai/anthropic provider on the account "default" gateway.
 *
 * The google plugin parses native generateContent on `transport: "gateway"`.
 * openai stays registered so a catalog run-path regression is parseable
 * instead of failing with a missing-plugin error.
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

	return workersai(COPILOT_GEMINI_MODEL_ID, COPILOT_GATEWAY_MODEL_OPTIONS);
}
