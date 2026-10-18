/**
 * Ask speaks the Agents websocket protocol by hand. Think will not deliver a
 * continuation's text-delta frames until the client acks `cf_agent_stream_resuming`.
 * The persisted answer still arrives on `cf_agent_message_updated` /
 * `cf_agent_chat_messages`, which Ask also has to apply.
 */

export function copilotResumeAckFrame(event: {
	type?: string;
	id?: unknown;
}): { type: "cf_agent_stream_resume_ack"; id: string } | null {
	if (event.type !== "cf_agent_stream_resuming") return null;
	if (typeof event.id !== "string" || event.id.length === 0) return null;
	return { type: "cf_agent_stream_resume_ack", id: event.id };
}

const LIVE_TURN_EVENTS = new Set([
	"cf_agent_use_chat_response",
	"cf_agent_stream_resuming",
	"cf_agent_stream_pending",
	"cf_agent_message_updated",
	"cf_agent_chat_messages",
	"text_delta",
	"reasoning_start",
	"reasoning_delta",
	"reasoning_end",
	"message_start",
	"message_end",
	"tool_start",
	"tool_end",
	"approval_request",
]);

/** Usage ticks alone must not keep a silent turn alive. */
export function copilotEventKeepsTurnAlive(type: string): boolean {
	return LIVE_TURN_EVENTS.has(type);
}

export type ServerTranscriptMessage = {
	id?: string;
	role?: string;
	content?: string;
	parts?: Array<{ type?: string; text?: string }>;
};

export function serverTranscriptFromCopilotEvent(event: {
	type?: string;
	message?: ServerTranscriptMessage;
	messages?: ServerTranscriptMessage[];
}): ServerTranscriptMessage[] | null {
	if (
		event.type === "cf_agent_chat_messages" &&
		Array.isArray(event.messages)
	) {
		return event.messages;
	}
	if (event.type === "cf_agent_message_updated" && event.message) {
		return [event.message];
	}
	return null;
}

export function assistantTextFromServerMessage(
	message: ServerTranscriptMessage,
): string {
	const fromParts = (message.parts ?? [])
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text ?? "")
		.join("");
	if (fromParts.length > 0) return fromParts;
	if (message.role === "assistant" && typeof message.content === "string") {
		return message.content;
	}
	return "";
}

export type VisibleTranscriptMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

/**
 * Copy assistant text from a server transcript onto the local bubbles.
 * User rows are left alone: Ask already appended the optimistic user message,
 * and echoing the server copy is what shows that message twice.
 */
export function mergeCopilotServerTranscript<
	T extends VisibleTranscriptMessage,
>(current: T[], serverMessages: ServerTranscriptMessage[]): T[] {
	let next = current;
	for (const server of serverMessages) {
		if (server.role !== "assistant") continue;
		const text = assistantTextFromServerMessage(server);
		if (text.trim().length === 0) continue;
		const id =
			typeof server.id === "string" && server.id.length > 0 ? server.id : null;
		const byId = id ? next.findIndex((message) => message.id === id) : -1;
		if (byId >= 0) {
			const existing = next[byId];
			if (
				existing?.role === "assistant" &&
				text.length > existing.content.length &&
				text.startsWith(existing.content)
			) {
				const copy = next.slice();
				copy[byId] = { ...existing, content: text };
				next = copy;
			}
			continue;
		}
		const last = next[next.length - 1];
		if (last?.role === "assistant") {
			if (text === last.content) continue;
			if (text.startsWith(last.content)) {
				next = [
					...next.slice(0, -1),
					{ ...last, content: text, ...(id ? { id } : {}) },
				];
			}
			continue;
		}
		next = [
			...next,
			{
				id: id ?? crypto.randomUUID(),
				role: "assistant",
				content: text,
			} as T,
		];
	}
	return next;
}
