/**
 * Latest user text from a Think turn context (AI SDK ModelMessages).
 *
 * Moved unchanged out of workers/copilot.ts so tests can import it. Web and
 * iOS both send `parts: [{ type: "text" }]`; `convertToModelMessages` turns
 * that into `content: [{ type: "text", text }]`. Tool results have
 * `role: "tool"`, so they are never read as user text. Think's context
 * reminder is appended as an extra text part on the same user message.
 */
export type CopilotTurnTextMessage = {
	role: string;
	content?: unknown;
};

export function lastUserText(ctx: {
	messages: readonly CopilotTurnTextMessage[];
}): string {
	for (let index = ctx.messages.length - 1; index >= 0; index -= 1) {
		const message = ctx.messages[index];
		if (message?.role !== "user") continue;
		const content = message.content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return content
				.map((part: unknown) =>
					typeof part === "object" &&
					part !== null &&
					"text" in part &&
					typeof part.text === "string"
						? part.text
						: "",
				)
				.join("\n");
		}
	}
	return "";
}

export function countUserMessages(ctx: {
	messages: readonly CopilotTurnTextMessage[];
}): number {
	return ctx.messages.filter((message) => message.role === "user").length;
}
