export const COPILOT_CONVERSATION_FLOOR_COST = 1;
export const CREW_COPILOT_DAILY_CONVERSATIONS = 3;
export const FREE_TIER_DAILY_CONVERSATIONS = 0;

/** One-time iOS welcome briefing — single assistant response, no tools. */
export const ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT =
	"I'm new to Ration on iOS. In plain language: what is it, how do Cargo, Galley, Manifest, and Supply work together, and what's the fastest way to get started?";

export const ONBOARDING_BRIEFING_PENDING_TTL_SEC = 300;
export const ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export const ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS = 700;

export const COPILOT_SESSION_IDLE_MS = 20 * 60 * 1000;
export const COPILOT_SESSION_MAX_MESSAGES = 40;
export const COPILOT_SESSION_MAX_TOKENS = 60_000;

export const COPILOT_COST_BRACKETS = [
	{ maxTokens: 12_000, credits: 1 },
	{ maxTokens: 30_000, credits: 2 },
	{ maxTokens: 60_000, credits: 3 },
	{ maxTokens: null, credits: 4 },
] as const;

export type CopilotCostBracket = (typeof COPILOT_COST_BRACKETS)[number];

export function creditsForCopilotTokens(totalTokens: number): number {
	const normalized = Math.max(0, Math.ceil(totalTokens));
	const bracket = COPILOT_COST_BRACKETS.find(
		(b) => b.maxTokens === null || normalized <= b.maxTokens,
	);
	return bracket?.credits ?? COPILOT_CONVERSATION_FLOOR_COST;
}
