/**
 * Ask speaks the Agents websocket protocol by hand. Think will not deliver a
 * continuation's text-delta frames until the client acks `cf_agent_stream_resuming`.
 * The persisted answer still arrives on `cf_agent_message_updated` /
 * `cf_agent_chat_messages`, which Ask also has to apply — but only for the
 * current turn.
 */

export function copilotResumeAckFrame(event: {
	type?: string;
	id?: unknown;
}): { type: "cf_agent_stream_resume_ack"; id: string } | null {
	if (event.type !== "cf_agent_stream_resuming") return null;
	if (typeof event.id !== "string" || event.id.length === 0) return null;
	return { type: "cf_agent_stream_resume_ack", id: event.id };
}

/** Id of a resumed continuation, from the resuming frame or a continuation done. */
export function copilotContinuationRequestId(event: {
	type?: string;
	id?: unknown;
	continuation?: unknown;
}): string | null {
	if (typeof event.id !== "string" || event.id.length === 0) return null;
	if (event.type === "cf_agent_stream_resuming") return event.id;
	if (event.continuation === true) return event.id;
	return null;
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
	if (message.role !== "assistant") return "";
	const fromParts = (message.parts ?? [])
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text ?? "")
		.join("");
	if (fromParts.length > 0) return fromParts;
	if (typeof message.content === "string") return message.content;
	return "";
}

/** Assistant text only. A user row must not count as answer activity. */
export function copilotServerTranscriptHasAnswer(
	messages: readonly ServerTranscriptMessage[],
): boolean {
	return messages.some(
		(message) =>
			message.role === "assistant" &&
			assistantTextFromServerMessage(message).trim().length > 0,
	);
}

export type VisibleTranscriptMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

/**
 * Merge server transcripts only while a turn is in flight. An idle panel
 * still accepts the continuation it is waiting on after Approve.
 */
export function shouldApplyCopilotServerTranscript(state: {
	status: "idle" | "active" | "awaiting_approval" | "stopping";
	expectingApprovalContinuation: boolean;
}): boolean {
	if (state.expectingApprovalContinuation) return true;
	return state.status !== "idle";
}

function lastUserIndex(messages: readonly { role: string }[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") return index;
	}
	return -1;
}

function trailingTurnAssistantIndex<T extends VisibleTranscriptMessage>(
	messages: readonly T[],
	userIndex: number,
): number {
	for (let index = messages.length - 1; index > userIndex; index -= 1) {
		if (messages[index]?.role === "assistant") return index;
	}
	return -1;
}

/**
 * Copy assistant text from the current turn onto the local bubbles.
 * The server keeps the client's user ids. Only assistants after that id,
 * and before the next user message, belong to this turn. A frame that does
 * not contain the id is ignored, so another tab cannot land here.
 * A server id is adopted only when the bubble already has that exact text.
 */
export function mergeCopilotServerTranscript<
	T extends VisibleTranscriptMessage,
>(current: T[], serverMessages: ServerTranscriptMessage[]): T[] {
	const userIndex = lastUserIndex(current);
	if (userIndex < 0) return current;
	const userId = current[userIndex]?.id;
	if (!userId) return current;
	const serverUserIndex = serverMessages.findIndex(
		(message) => message.role === "user" && message.id === userId,
	);
	if (serverUserIndex < 0) return current;

	let next = current;
	for (
		let index = serverUserIndex + 1;
		index < serverMessages.length;
		index += 1
	) {
		const server = serverMessages[index];
		if (!server || server.role === "user") break;
		if (server.role !== "assistant") continue;
		const text = assistantTextFromServerMessage(server);
		if (text.trim().length === 0) continue;
		next = applyServerAssistantText(next, userIndex, server, text);
	}
	return next;
}

function applyServerAssistantText<T extends VisibleTranscriptMessage>(
	current: T[],
	userIndex: number,
	server: ServerTranscriptMessage,
	text: string,
): T[] {
	const id =
		typeof server.id === "string" && server.id.length > 0 ? server.id : null;
	if (id) {
		const byId = current.findIndex((message) => message.id === id);
		if (byId >= 0) {
			const existing = current[byId];
			if (
				existing?.role === "assistant" &&
				byId > userIndex &&
				text.length > existing.content.length &&
				text.startsWith(existing.content)
			) {
				const copy = current.slice();
				copy[byId] = { ...existing, content: text };
				return copy;
			}
			return current;
		}
	}

	const trailing = trailingTurnAssistantIndex(current, userIndex);
	if (trailing >= 0) {
		const existing = current[trailing];
		if (!existing) return current;
		if (existing.content === text) {
			if (!id || existing.id === id) return current;
			const copy = current.slice();
			copy[trailing] = { ...existing, id };
			return copy;
		}
		if (
			text.startsWith(existing.content) ||
			existing.content.startsWith(text)
		) {
			if (existing.content.startsWith(text)) return current;
			const copy = current.slice();
			copy[trailing] = { ...existing, content: text };
			return copy;
		}
		return current;
	}

	return [
		...current,
		{
			id: id ?? crypto.randomUUID(),
			role: "assistant",
			content: text,
		} as T,
	];
}

/**
 * A `replay: true` stream repeats a continuation that already arrived via
 * `chat_messages`. Replace the current-turn bubble when the replay extends
 * it, and leave it alone when the bubble already contains that text.
 */
export function applyCopilotReplayText<T extends VisibleTranscriptMessage>(
	current: T[],
	replayedText: string,
): T[] {
	if (replayedText.length === 0) return current;
	const userIndex = lastUserIndex(current);
	if (userIndex < 0) return current;
	const trailing = trailingTurnAssistantIndex(current, userIndex);
	if (trailing < 0) {
		if (replayedText.trim().length === 0) return current;
		return [
			...current,
			{
				id: crypto.randomUUID(),
				role: "assistant",
				content: replayedText,
			} as T,
		];
	}
	const existing = current[trailing];
	if (!existing) return current;
	if (
		existing.content === replayedText ||
		existing.content.startsWith(replayedText)
	) {
		return current;
	}
	if (replayedText.startsWith(existing.content)) {
		const copy = current.slice();
		copy[trailing] = { ...existing, content: replayedText };
		return copy;
	}
	return current;
}
