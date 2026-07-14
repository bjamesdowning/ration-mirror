import {
	COPILOT_SESSION_MAX_MESSAGES,
	COPILOT_SESSION_MAX_TOKENS,
	creditsForCopilotTokens,
	nextCreditThreshold,
	tokensUntilNextCredit,
} from "./constants";

export type SessionUsageSnapshot = {
	totalTokens: number;
	maxTokens: number;
	messageCount: number;
	maxMessages: number;
	creditsCharged: number;
	creditBalance: number;
	/** Tokens remaining until the next credit tier. */
	nextCreditAt: number | null;
	/** Absolute token count where the next credit tier starts. */
	nextCreditThreshold: number | null;
};

export type SessionLimitWarningSeverity = "soft" | "urgent";

export type SessionLimitWarning = {
	severity: SessionLimitWarningSeverity;
	message: string;
};

const SOFT_TOKEN_RATIO = 0.5;
const URGENT_TOKEN_RATIO = 0.85;
const SOFT_MESSAGE_COUNT = 30;
const URGENT_MESSAGE_COUNT = 36;

export function formatCopilotTokenCount(tokens: number): string {
	const normalized = Math.max(0, Math.ceil(tokens));
	if (normalized >= 10_000) {
		return `${Math.round(normalized / 1000)}k`;
	}
	return normalized.toLocaleString();
}

export function buildSessionUsageSnapshot(input: {
	totalTokens: number;
	messageCount: number;
	creditsCharged: number;
	creditBalance: number;
}): SessionUsageSnapshot {
	const totalTokens = Math.max(0, Math.ceil(input.totalTokens));
	return {
		totalTokens,
		maxTokens: COPILOT_SESSION_MAX_TOKENS,
		messageCount: Math.max(0, Math.ceil(input.messageCount)),
		maxMessages: COPILOT_SESSION_MAX_MESSAGES,
		creditsCharged: Math.max(0, Math.ceil(input.creditsCharged)),
		creditBalance: Math.max(0, Math.ceil(input.creditBalance)),
		nextCreditAt: tokensUntilNextCredit(totalTokens),
		nextCreditThreshold: nextCreditThreshold(totalTokens),
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
			message: `This chat is nearly at the ${formatCopilotTokenCount(COPILOT_SESSION_MAX_TOKENS)} token limit (~${formatCopilotTokenCount(totalTokens)} used). Wrap up or start a new chat soon.`,
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

/** @deprecated Use tokensUntilNextCredit from constants.ts */
export function tokensUntilNextBracket(totalTokens: number): number | null {
	return tokensUntilNextCredit(totalTokens);
}

export { creditsForCopilotTokens };
