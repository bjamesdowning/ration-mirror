import { creditsForCopilotTokens } from "./constants";

export type CopilotTurnUsageDecision = "commit" | "discard" | "hold";

type UsagePart = {
	type?: string;
	text?: string;
	state?: string;
};

function partHasAnswerText(part: UsagePart): boolean {
	return (
		part.type === "text" &&
		typeof part.text === "string" &&
		part.text.trim().length > 0
	);
}

/** A tool that already produced output. An approval request has not run yet. */
function partHasToolOutput(part: UsagePart): boolean {
	return part.state === "output-available" || part.state === "output-error";
}

/**
 * Commit when the turn produced answer text or a tool actually ran.
 * An approval pause (`approval-requested`, no output) stays held for the
 * continuation. An error or abort with no answer and no tool output is discarded.
 */
export function copilotTurnUsageDecision(input: {
	status: "completed" | "error" | "aborted";
	parts?: ReadonlyArray<UsagePart> | null;
	/** A tool executed earlier in this turn, including the pause half. */
	toolRan?: boolean;
	/** The canned blocked reply. Its text must not raise the bracket. */
	suppressCommit?: boolean;
}): CopilotTurnUsageDecision {
	if (input.suppressCommit) return "discard";
	const parts = input.parts ?? [];
	if (parts.some(partHasAnswerText)) return "commit";
	if (parts.some(partHasToolOutput)) return "commit";
	if (input.toolRan) return "commit";
	if (input.status === "error" || input.status === "aborted") return "discard";
	return "hold";
}

/**
 * A persisted block stays only while the next bracket is still unaffordable.
 * A top-up that covers that bracket clears it. Callers persist the result.
 */
export function copilotBillingBlockAfterBalanceCheck(input: {
	blocked: boolean;
	mode: "allowance" | "credits" | "onboarding_briefing";
	totalTokens: number;
	pendingTokens: number;
	bracketCreditsCharged: number;
	creditBalance: number;
}): boolean {
	if (!input.blocked) return false;
	return copilotStepExceedsBalance(input);
}

/** Insufficient credits sticks the block. The caller must persist it. */
export function copilotUsageAfterInsufficientCredits<
	T extends { billingBlocked: boolean },
>(state: T): T & { billingBlocked: true; persist: true } {
	return { ...state, billingBlocked: true, persist: true };
}

/**
 * Read-only check: the next bracket is unaffordable. Does not charge.
 * Allowance and onboarding turns do not bill brackets.
 */
export function copilotStepExceedsBalance(input: {
	mode: "allowance" | "credits" | "onboarding_briefing";
	totalTokens: number;
	pendingTokens: number;
	bracketCreditsCharged: number;
	creditBalance: number;
}): boolean {
	if (input.mode !== "credits") return false;
	const targetCredits = creditsForCopilotTokens(
		input.totalTokens + input.pendingTokens,
	);
	const delta = targetCredits - input.bracketCreditsCharged;
	if (delta <= 0) return false;
	return input.creditBalance < delta;
}
