export const COPILOT_CONTINUATION_DRAFT_PREFIX =
	"Continuing from our previous chat: ";

export type CopilotTranscriptMessage = {
	role: string;
	content: string;
};

export function buildCopilotContinuationDraft(): string {
	return COPILOT_CONTINUATION_DRAFT_PREFIX;
}

export function formatCopilotTranscriptForCopy(
	messages: CopilotTranscriptMessage[],
): string {
	return messages
		.filter((message) => message.content.trim().length > 0)
		.map((message) => {
			const speaker = message.role === "user" ? "You" : "Ration";
			return `${speaker}: ${message.content.trim()}`;
		})
		.join("\n\n");
}
