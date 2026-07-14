import { describe, expect, it } from "vitest";
import { decodeAgentResponseFrame } from "../copilot/agent-frame.client";

const responseFrame = (
	body?: string,
	options: { done?: boolean; error?: boolean } = {},
) => ({
	type: "cf_agent_use_chat_response",
	id: "response-1",
	body,
	...options,
});

describe("decodeAgentResponseFrame", () => {
	it("maps text deltas", () => {
		expect(
			decodeAgentResponseFrame(
				responseFrame(JSON.stringify({ type: "text-delta", delta: "Hello" })),
			),
		).toEqual({ kind: "text_delta", text: "Hello" });
	});

	it("maps tool start and completion frames", () => {
		expect(
			decodeAgentResponseFrame(
				responseFrame(
					JSON.stringify({
						type: "tool-input-start",
						toolName: "list_inventory",
						toolCallId: "tool-1",
					}),
				),
			),
		).toEqual({
			kind: "tool_start",
			toolName: "list_inventory",
			toolCallId: "tool-1",
		});

		expect(
			decodeAgentResponseFrame(
				responseFrame(
					JSON.stringify({
						type: "tool-output-available",
						toolName: "list_inventory",
						toolCallId: "tool-1",
					}),
				),
			),
		).toEqual({
			kind: "tool_end",
			toolName: "list_inventory",
			toolCallId: "tool-1",
			succeeded: true,
		});
	});

	it("maps finish and terminal done frames to turn end", () => {
		expect(
			decodeAgentResponseFrame(
				responseFrame(JSON.stringify({ type: "finish" })),
			),
		).toEqual({ kind: "turn_end" });
		expect(
			decodeAgentResponseFrame(responseFrame(undefined, { done: true })),
		).toEqual({ kind: "turn_end" });
	});

	it("keeps duplicate terminal signals idempotent for consumers", () => {
		const finish = decodeAgentResponseFrame(
			responseFrame(JSON.stringify({ type: "finish" })),
		);
		const done = decodeAgentResponseFrame(
			responseFrame(undefined, { done: true }),
		);
		expect([finish, done]).toEqual([
			{ kind: "turn_end" },
			{ kind: "turn_end" },
		]);
	});

	it("ignores malformed and unknown body chunks", () => {
		expect(decodeAgentResponseFrame(responseFrame("not-json"))).toEqual({
			kind: "noop",
		});
		expect(
			decodeAgentResponseFrame(
				responseFrame(JSON.stringify({ type: "start-step" })),
			),
		).toEqual({ kind: "noop" });
	});

	it("maps reasoning stream chunks", () => {
		expect(
			decodeAgentResponseFrame(
				responseFrame(JSON.stringify({ type: "reasoning-start" })),
			),
		).toEqual({ kind: "reasoning_start" });
		expect(
			decodeAgentResponseFrame(
				responseFrame(
					JSON.stringify({ type: "reasoning-delta", delta: "Plan meals" }),
				),
			),
		).toEqual({ kind: "reasoning_delta", text: "Plan meals" });
		expect(
			decodeAgentResponseFrame(
				responseFrame(JSON.stringify({ type: "reasoning-end" })),
			),
		).toEqual({ kind: "reasoning_end" });
	});

	it("maps agent errors with their message", () => {
		expect(
			decodeAgentResponseFrame(
				responseFrame("Model unavailable", { error: true }),
			),
		).toEqual({ kind: "error", message: "Model unavailable" });
	});
});
