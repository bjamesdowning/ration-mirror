import {
	COPILOT_COST_BRACKETS,
	COPILOT_SESSION_MAX_MESSAGES,
	COPILOT_SESSION_MAX_TOKENS,
	creditsForCopilotTokens,
} from "./constants";

export type SessionUsageSnapshot = {
	totalTokens: number;
	maxTokens: number;
	messageCount: number;
	maxMessages: number;
	creditsCharged: number;
	creditBalance: number;
	nextBracketAt: number | null;
};

export type SessionLimitWarningSeverity = "soft" | "urgent";

export type SessionLimitWarning = {
	severity: SessionLimitWarningSeverity;
	message: string;
};

const SOFT_TOKEN_RATIO = 0.75;
const URGENT_TOKEN_RATIO = 0.9;
const SOFT_MESSAGE_COUNT = 30;
const URGENT_MESSAGE_COUNT = 36;

export function formatCopilotTokenCount(tokens: number): string {
	const normalized = Math.max(0, Math.ceil(tokens));
	if (normalized >= 10_000) {
		return `${Math.round(normalized / 1000)}k`;
	}
	return normalized.toLocaleString();
}

export function tokensUntilNextBracket(totalTokens: number): number | null {
	const normalized = Math.max(0, Math.ceil(totalTokens));
	const currentCredits = creditsForCopilotTokens(normalized);
	const currentBracketIndex = COPILOT_COST_BRACKETS.findIndex(
		(bracket) => bracket.credits === currentCredits,
	);
	if (currentBracketIndex === -1) return null;
	const currentBracket = COPILOT_COST_BRACKETS[currentBracketIndex];
	const nextBracket = COPILOT_COST_BRACKETS[currentBracketIndex + 1];
	if (!currentBracket || !nextBracket || currentBracket.maxTokens === null) {
		return null;
	}
	const nextTierStart = currentBracket.maxTokens + 1;
	return Math.max(1, nextTierStart - normalized);
}

export function buildSessionUsageSnapshot(input: {
	totalTokens: number;
	messageCount: number;
	creditsCharged: number;
	creditBalance: number;
}): SessionUsageSnapshot {
	return {
		totalTokens: Math.max(0, Math.ceil(input.totalTokens)),
		maxTokens: COPILOT_SESSION_MAX_TOKENS,
		messageCount: Math.max(0, Math.ceil(input.messageCount)),
		maxMessages: COPILOT_SESSION_MAX_MESSAGES,
		creditsCharged: Math.max(0, Math.ceil(input.creditsCharged)),
		creditBalance: Math.max(0, Math.ceil(input.creditBalance)),
		nextBracketAt: tokensUntilNextBracket(input.totalTokens),
	};
}

export function evaluateSessionLimitWarning(input: {
	totalTokens: number;
	messageCount: number;
	emittedSoft: boolean;
	emittedUrgent: boolean;
}): SessionLimitWarning | null {
	const totalTokens = Math.max(0, Math.ceil(input.totalTokens));
	const messageCount = Math.max(0, Math.ceil(input.messageCount));
	const tokenRatio = totalTokens / COPILOT_SESSION_MAX_TOKENS;

	if (
		!input.emittedUrgent &&
		(tokenRatio >= URGENT_TOKEN_RATIO || messageCount >= URGENT_MESSAGE_COUNT)
	) {
		return {
			severity: "urgent",
			message: `This chat is nearly full (~${formatCopilotTokenCount(totalTokens)}/${formatCopilotTokenCount(COPILOT_SESSION_MAX_TOKENS)} tokens). Start a new chat soon to avoid hitting the limit.`,
		};
	}

	if (
		!input.emittedSoft &&
		(tokenRatio >= SOFT_TOKEN_RATIO || messageCount >= SOFT_MESSAGE_COUNT)
	) {
		return {
			severity: "soft",
			message: `This chat is getting long (~${formatCopilotTokenCount(totalTokens)}/${formatCopilotTokenCount(COPILOT_SESSION_MAX_TOKENS)} tokens). Consider starting a new chat soon.`,
		};
	}

	return null;
}
