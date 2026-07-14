export type AgentResponseFrame = {
	type: string;
	id?: string;
	body?: string;
	done?: boolean;
	error?: boolean | { code?: string; message?: string };
};

export type AgentFrameAction =
	| { kind: "noop" }
	| { kind: "text_delta"; text: string }
	| { kind: "reasoning_start" }
	| { kind: "reasoning_delta"; text: string }
	| { kind: "reasoning_end" }
	| { kind: "tool_start"; toolName: string; toolCallId?: string }
	| {
			kind: "tool_end";
			toolName: string;
			toolCallId?: string;
			succeeded: boolean;
	  }
	| { kind: "approval_requested"; toolName: string; toolCallId?: string }
	| { kind: "turn_end" }
	| { kind: "error"; message: string };

type AgentChunk = {
	type?: string;
	id?: string;
	delta?: string;
	text?: string;
	toolName?: string;
	toolCallId?: string;
};

export function decodeAgentResponseFrame(
	frame: AgentResponseFrame,
): AgentFrameAction {
	if (frame.type !== "cf_agent_use_chat_response") {
		return { kind: "noop" };
	}

	if (frame.error) {
		const message =
			typeof frame.error === "object"
				? (frame.error.message ?? frame.body)
				: frame.body;
		return { kind: "error", message: message ?? "Copilot hit an error." };
	}

	if (frame.done) {
		return { kind: "turn_end" };
	}

	if (!frame.body) {
		return { kind: "noop" };
	}

	let chunk: AgentChunk;
	try {
		chunk = JSON.parse(frame.body) as AgentChunk;
	} catch {
		return { kind: "noop" };
	}

	switch (chunk.type) {
		case "text-delta":
			return {
				kind: "text_delta",
				text: chunk.delta ?? chunk.text ?? "",
			};
		case "reasoning-start":
			return { kind: "reasoning_start" };
		case "reasoning-delta":
			return {
				kind: "reasoning_delta",
				text: chunk.delta ?? chunk.text ?? "",
			};
		case "reasoning-end":
			return { kind: "reasoning_end" };
		case "tool-input-start":
		case "tool-input-available":
			return {
				kind: "tool_start",
				toolName: chunk.toolName ?? "tool",
				toolCallId: chunk.toolCallId ?? chunk.id,
			};
		case "tool-output-available":
		case "tool-output-error":
		case "tool-output-denied":
			return {
				kind: "tool_end",
				toolName: chunk.toolName ?? "tool",
				toolCallId: chunk.toolCallId ?? chunk.id,
				succeeded: chunk.type === "tool-output-available",
			};
		case "approval-requested":
			return {
				kind: "approval_requested",
				toolName: chunk.toolName ?? "Copilot action",
				toolCallId: chunk.toolCallId ?? chunk.id,
			};
		case "finish":
			return { kind: "turn_end" };
		default:
			return { kind: "noop" };
	}
}
