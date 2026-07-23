export const COPILOT_CONVERSATION_FLOOR_COST = 1;
export const CREW_COPILOT_DAILY_CONVERSATIONS = 1;
export const FREE_TIER_DAILY_CONVERSATIONS = 0;

/** Turn 1 — auto-sent intro (search_docs then answer). */
export const ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT = "What is Ration?";

/** Turn 2 — single-item kitchen seed via add_cargo_item (expiry + tag demo). */
export const ONBOARDING_BRIEFING_SEED_PROMPT = `Please add 2 litres of milk to my cargo.

Set expiry to about 2 weeks from today, and tag it as dairy.

Use today's date from context to calculate the expiry date. Add the item with add_cargo_item. When done, briefly confirm what you added, including the expiry date and tag.`;

/** Max user turns allowed during free onboarding briefing (intro + seed). */
export const ONBOARDING_BRIEFING_MAX_TURNS = 2;

/** Pending briefing claims bind to a conversation for this long (legacy constant; claim uses session idle). */
export const ONBOARDING_BRIEFING_PENDING_TTL_SEC = 300;
export const ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
/** Fast-level output budget — do not lower aggressively (truncation/errors hurt reliability). */
export const ONBOARDING_BRIEFING_MAX_OUTPUT_TOKENS = 2048;
export const ONBOARDING_BRIEFING_INTRO_MAX_STEPS = 3;
export const ONBOARDING_BRIEFING_SEED_MAX_STEPS = 8;

export const COPILOT_SESSION_IDLE_MS = 20 * 60 * 1000;
export const COPILOT_SESSION_MAX_MESSAGES = 120;
/** MiniMax M3 (Workers AI) session budget — linear billing caps here (1 cr / 20k → max 25 cr/chat). */
export const COPILOT_SESSION_MAX_TOKENS = 500_000;
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
