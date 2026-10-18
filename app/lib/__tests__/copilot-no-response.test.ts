import { describe, expect, it } from "vitest";
import {
	assistantTextFromServerMessage,
	copilotEventKeepsTurnAlive,
	copilotResumeAckFrame,
	mergeCopilotServerTranscript,
	serverTranscriptFromCopilotEvent,
} from "../copilot/stream-resume.client";
import { copilotTurnUsageDecision } from "../copilot/turn-usage";

describe("copilot resume handshake", () => {
	it("acks cf_agent_stream_resuming with the server request id", () => {
		expect(
			copilotResumeAckFrame({
				type: "cf_agent_stream_resuming",
				id: "req-1",
			}),
		).toEqual({ type: "cf_agent_stream_resume_ack", id: "req-1" });
	});

	it("does not ack other frames or a resume with no id", () => {
		expect(
			copilotResumeAckFrame({
				type: "cf_agent_use_chat_response",
				id: "req-1",
			}),
		).toBeNull();
		expect(
			copilotResumeAckFrame({ type: "cf_agent_stream_resuming" }),
		).toBeNull();
	});

	it("treats stream frames as activity and usage ticks as silence", () => {
		expect(copilotEventKeepsTurnAlive("cf_agent_use_chat_response")).toBe(true);
		expect(copilotEventKeepsTurnAlive("cf_agent_stream_resuming")).toBe(true);
		expect(copilotEventKeepsTurnAlive("reasoning_delta")).toBe(true);
		expect(copilotEventKeepsTurnAlive("session_usage_update")).toBe(false);
	});
});

describe("copilot server transcript", () => {
	it("reads the continuation answer from message_updated when no text-delta arrived", () => {
		const event = {
			type: "cf_agent_message_updated",
			message: {
				id: "asst-1",
				role: "assistant",
				parts: [
					{ type: "step-start" },
					{
						type: "tool-edit_cargo",
						state: "output-available",
					},
					{ type: "text", text: "Moved the rice." },
				],
			},
		};
		const server = serverTranscriptFromCopilotEvent(event);
		expect(server).not.toBeNull();
		const next = mergeCopilotServerTranscript(
			[{ id: "user-1", role: "user" as const, content: "move the rice" }],
			server ?? [],
		);
		expect(next).toEqual([
			{ id: "user-1", role: "user", content: "move the rice" },
			{ id: "asst-1", role: "assistant", content: "Moved the rice." },
		]);
	});

	it("does not append a second copy of the user message from chat_messages", () => {
		const event = {
			type: "cf_agent_chat_messages",
			messages: [
				{
					id: "server-user",
					role: "user",
					parts: [{ type: "text", text: "move the rice" }],
				},
				{
					id: "asst-1",
					role: "assistant",
					parts: [{ type: "text", text: "Moved the rice." }],
				},
			],
		};
		const next = mergeCopilotServerTranscript(
			[{ id: "local-user", role: "user" as const, content: "move the rice" }],
			serverTranscriptFromCopilotEvent(event) ?? [],
		);
		expect(next.filter((message) => message.role === "user")).toEqual([
			{ id: "local-user", role: "user", content: "move the rice" },
		]);
		expect(next[1]).toEqual({
			id: "asst-1",
			role: "assistant",
			content: "Moved the rice.",
		});
	});

	it("extends a partial assistant bubble instead of duplicating it", () => {
		const next = mergeCopilotServerTranscript(
			[{ id: "asst-1", role: "assistant" as const, content: "Moved" }],
			[
				{
					id: "asst-1",
					role: "assistant",
					parts: [{ type: "text", text: "Moved the rice." }],
				},
			],
		);
		expect(next).toEqual([
			{ id: "asst-1", role: "assistant", content: "Moved the rice." },
		]);
	});

	it("ignores tool-only updates", () => {
		expect(
			assistantTextFromServerMessage({
				role: "assistant",
				parts: [{ type: "tool-edit_cargo", text: "" }],
			}),
		).toBe("");
	});
});

describe("copilot turn usage", () => {
	it("commits only when the assistant message has answer text", () => {
		expect(
			copilotTurnUsageDecision({
				status: "completed",
				parts: [{ type: "text", text: "Moved the rice." }],
			}),
		).toBe("commit");
	});

	it("holds a tool-only completion for the continuation", () => {
		expect(
			copilotTurnUsageDecision({
				status: "completed",
				parts: [{ type: "tool-edit_cargo" }],
			}),
		).toBe("hold");
	});

	it("discards an error or abort that produced no answer", () => {
		expect(
			copilotTurnUsageDecision({
				status: "error",
				parts: [{ type: "reasoning", text: "thinking" }],
			}),
		).toBe("discard");
		expect(copilotTurnUsageDecision({ status: "aborted", parts: [] })).toBe(
			"discard",
		);
	});

	it("does not treat whitespace as an answer", () => {
		expect(
			copilotTurnUsageDecision({
				status: "completed",
				parts: [{ type: "text", text: "   " }],
			}),
		).toBe("hold");
	});
});
