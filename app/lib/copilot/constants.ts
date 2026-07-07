export const COPILOT_CONVERSATION_FLOOR_COST = 1;
export const CREW_COPILOT_DAILY_CONVERSATIONS = 3;
export const FREE_TIER_DAILY_CONVERSATIONS = 0;

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
