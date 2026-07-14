export const COPILOT_CONVERSATION_FLOOR_COST = 1;
export const CREW_COPILOT_DAILY_CONVERSATIONS = 1;
export const FREE_TIER_DAILY_CONVERSATIONS = 0;

/** One-time iOS welcome briefing — single assistant response, no tools. */
export const ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT =
	"I'm new to Ration on iOS. In plain language: what is it, how do Cargo, Galley, Manifest, and Supply work together, and what's the fastest way to get started?";

export const ONBOARDING_BRIEFING_PENDING_TTL_SEC = 300;
export const ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export const ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS = 700;

export const COPILOT_SESSION_IDLE_MS = 20 * 60 * 1000;
export const COPILOT_SESSION_MAX_MESSAGES = 40;
/** gpt-oss-120b context window — linear billing caps sessions here. */
export const COPILOT_SESSION_MAX_TOKENS = 128_000;
export const COPILOT_TOKENS_PER_CREDIT = 20_000;

export function creditsForCopilotTokens(totalTokens: number): number {
	const normalized = Math.max(0, Math.ceil(totalTokens));
	return Math.max(
		COPILOT_CONVERSATION_FLOOR_COST,
		Math.ceil(normalized / COPILOT_TOKENS_PER_CREDIT),
	);
}

/** Tokens until the next credit tier (linear 20k steps). Null at session cap. */
export function tokensUntilNextCredit(totalTokens: number): number | null {
	const normalized = Math.max(0, Math.ceil(totalTokens));
	if (normalized >= COPILOT_SESSION_MAX_TOKENS) return null;
	const currentCredits = creditsForCopilotTokens(normalized);
	const nextTierStart = currentCredits * COPILOT_TOKENS_PER_CREDIT + 1;
	if (nextTierStart > COPILOT_SESSION_MAX_TOKENS) return null;
	return Math.max(1, nextTierStart - normalized);
}

/** Absolute token count where the next credit tier begins. Null at session cap. */
export function nextCreditThreshold(totalTokens: number): number | null {
	const normalized = Math.max(0, Math.ceil(totalTokens));
	if (normalized >= COPILOT_SESSION_MAX_TOKENS) return null;
	const credits = creditsForCopilotTokens(normalized);
	return Math.min(
		credits * COPILOT_TOKENS_PER_CREDIT + 1,
		COPILOT_SESSION_MAX_TOKENS,
	);
}
