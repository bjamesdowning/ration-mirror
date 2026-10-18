export type CopilotTurnUsageDecision = "commit" | "discard" | "hold";

/**
 * A model step's tokens are committed only when the turn produced answer text.
 * Tool-only completions (an approval pause) stay held for the continuation.
 * An error or abort with no answer is discarded, so it cannot raise the credit bracket.
 */
export function copilotTurnUsageDecision(input: {
	status: "completed" | "error" | "aborted";
	parts?: ReadonlyArray<{ type?: string; text?: string }> | null;
}): CopilotTurnUsageDecision {
	const hasAnswer = (input.parts ?? []).some(
		(part) =>
			part.type === "text" &&
			typeof part.text === "string" &&
			part.text.trim().length > 0,
	);
	if (hasAnswer) return "commit";
	if (input.status === "error" || input.status === "aborted") return "discard";
	return "hold";
}
