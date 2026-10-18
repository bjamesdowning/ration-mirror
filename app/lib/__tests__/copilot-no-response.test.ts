import { describe, expect, it } from "vitest";
import {
	applyCopilotReplayText,
	assistantTextFromServerMessage,
	copilotContinuationRequestId,
	copilotEventKeepsTurnAlive,
	copilotResumeAckFrame,
	copilotServerTranscriptHasAnswer,
	copilotTurnAssistantBaseline,
	mergeCopilotServerTranscript,
	serverTranscriptFromCopilotEvent,
	shouldApplyCopilotServerTranscript,
} from "../copilot/stream-resume.client";
import {
	copilotBillingBlockAfterBalanceCheck,
	copilotStepExceedsBalance,
	copilotTurnUsageDecision,
	copilotUsageAfterInsufficientCredits,
} from "../copilot/turn-usage";

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

	it("records the continuation id from resuming and continuation done frames", () => {
		expect(
			copilotContinuationRequestId({
				type: "cf_agent_stream_resuming",
				id: "6ed6aa78",
			}),
		).toBe("6ed6aa78");
		expect(
			copilotContinuationRequestId({
				type: "cf_agent_use_chat_response",
				id: "6ed6aa78",
				continuation: true,
			}),
		).toBe("6ed6aa78");
		expect(
			copilotContinuationRequestId({
				type: "cf_agent_use_chat_response",
				id: "be5807c4",
			}),
		).toBeNull();
	});
});

describe("copilot server transcript", () => {
	const priorTurn = [
		{ id: "user-1", role: "user" as const, content: "hello first" },
		{
			id: "local-plain",
			role: "assistant" as const,
			content: "plain reply to hello first",
		},
	];

	it("reads the continuation answer when the server transcript includes this user id", () => {
		const event = {
			type: "cf_agent_chat_messages",
			messages: [
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", text: "move the rice" }],
				},
				{
					id: "asst-1",
					role: "assistant",
					parts: [
						{ type: "step-start" },
						{ type: "tool-edit_cargo", state: "output-available" },
						{ type: "text", text: "Moved the rice." },
					],
				},
			],
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

	it("ignores a message_updated that does not contain the local user id", () => {
		const event = {
			type: "cf_agent_message_updated",
			message: {
				id: "asst-other",
				role: "assistant",
				parts: [{ type: "text", text: "from another turn" }],
			},
		};
		const next = mergeCopilotServerTranscript(
			[{ id: "user-1", role: "user" as const, content: "move the rice" }],
			serverTranscriptFromCopilotEvent(event) ?? [],
		);
		expect(next).toEqual([
			{ id: "user-1", role: "user", content: "move the rice" },
		]);
	});

	it("does not append a second copy of the user message from chat_messages", () => {
		const event = {
			type: "cf_agent_chat_messages",
			messages: [
				{
					id: "local-user",
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
		expect(next).toHaveLength(2);
		expect(next[1]).toEqual({
			id: "asst-1",
			role: "assistant",
			content: "Moved the rice.",
		});
	});

	it("extends a partial assistant bubble instead of duplicating it", () => {
		const next = mergeCopilotServerTranscript(
			[
				{ id: "user-1", role: "user" as const, content: "move the rice" },
				{ id: "asst-1", role: "assistant" as const, content: "Moved" },
			],
			[
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", text: "move the rice" }],
				},
				{
					id: "asst-1",
					role: "assistant",
					parts: [{ type: "text", text: "Moved the rice." }],
				},
			],
		);
		expect(next).toEqual([
			{ id: "user-1", role: "user", content: "move the rice" },
			{ id: "asst-1", role: "assistant", content: "Moved the rice." },
		]);
	});

	it("does not pull a prior turn's answer into an empty reasoning bubble", () => {
		const next = mergeCopilotServerTranscript(
			[
				...priorTurn,
				{ id: "user-2", role: "user" as const, content: "edit cargo rice" },
				{ id: "local-empty", role: "assistant" as const, content: "" },
			],
			[
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", text: "hello first" }],
				},
				{
					id: "server-plain",
					role: "assistant",
					parts: [{ type: "text", text: "plain reply to hello first" }],
				},
				{
					id: "user-2",
					role: "user",
					parts: [{ type: "text", text: "edit cargo rice" }],
				},
				{
					id: "server-answer",
					role: "assistant",
					parts: [{ type: "text", text: "after tool for edit cargo rice" }],
				},
			],
		);
		expect(next.map((message) => message.content)).toEqual([
			"hello first",
			"plain reply to hello first",
			"edit cargo rice",
			"after tool for edit cargo rice",
		]);
		expect(next[1]?.id).toBe("local-plain");
		expect(next[3]?.id).toBe("local-empty");
	});

	it("does not prepend a prior answer when the transcript ends on the new user message", () => {
		const next = mergeCopilotServerTranscript(
			[
				...priorTurn,
				{ id: "user-2", role: "user" as const, content: "edit cargo rice" },
			],
			[
				{ id: "user-1", role: "user", content: "hello first" },
				{
					id: "server-plain",
					role: "assistant",
					content: "plain reply to hello first",
				},
				{ id: "user-2", role: "user", content: "edit cargo rice" },
				{
					id: "server-answer",
					role: "assistant",
					content: "after tool for edit cargo rice",
				},
			],
		);
		expect(next.map((message) => message.content)).toEqual([
			"hello first",
			"plain reply to hello first",
			"edit cargo rice",
			"after tool for edit cargo rice",
		]);
		expect(next[1]?.id).toBe("local-plain");
		expect(next[3]?.id).toBe("server-answer");
	});

	it("ignores another tab's transcript when this user id is absent", () => {
		const local = [
			{ id: "user-tab", role: "user" as const, content: "silent please" },
		];
		const next = mergeCopilotServerTranscript(local, [
			{ id: "user-other", role: "user", content: "note from other tab" },
			{
				id: "asst-other",
				role: "assistant",
				content: "after tool for note from other tab",
			},
		]);
		expect(next).toEqual(local);
	});

	it("stops at the next user message so a later tab's answer is not merged", () => {
		const next = mergeCopilotServerTranscript(
			[
				{ id: "user-tab", role: "user" as const, content: "hello tab a" },
				{
					id: "local-a",
					role: "assistant" as const,
					content: "plain reply to hello tab a",
				},
			],
			[
				{ id: "user-tab", role: "user", content: "hello tab a" },
				{
					id: "server-a",
					role: "assistant",
					content: "plain reply to hello tab a",
				},
				{ id: "user-other", role: "user", content: "note from other tab" },
				{
					id: "asst-other",
					role: "assistant",
					content: "after tool for note from other tab",
				},
			],
		);
		expect(next.map((message) => message.content)).toEqual([
			"hello tab a",
			"plain reply to hello tab a",
		]);
		expect(next.some((message) => message.content.includes("other tab"))).toBe(
			false,
		);
	});

	it("does not adopt a server id when the bubble text differs", () => {
		const local = [
			{ id: "user-2", role: "user" as const, content: "edit cargo rice" },
			{ id: "local-garbled", role: "assistant" as const, content: "garbled" },
		];
		const next = mergeCopilotServerTranscript(local, [
			{ id: "user-2", role: "user", content: "edit cargo rice" },
			{
				id: "server-answer",
				role: "assistant",
				content: "after tool for edit cargo rice",
			},
		]);
		expect(next).toEqual(local);
	});

	it("skips merge while idle unless a continuation is expected", () => {
		expect(
			shouldApplyCopilotServerTranscript({
				status: "idle",
				expectingApprovalContinuation: false,
			}),
		).toBe(false);
		expect(
			shouldApplyCopilotServerTranscript({
				status: "idle",
				expectingApprovalContinuation: true,
			}),
		).toBe(true);
		expect(
			shouldApplyCopilotServerTranscript({
				status: "active",
				expectingApprovalContinuation: false,
			}),
		).toBe(true);
	});

	it("counts assistant text only as an answer", () => {
		expect(
			copilotServerTranscriptHasAnswer([
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", text: "move the rice" }],
				},
			]),
		).toBe(false);
		expect(
			copilotServerTranscriptHasAnswer([
				{
					role: "assistant",
					parts: [{ type: "text", text: "Moved the rice." }],
				},
			]),
		).toBe(true);
	});

	it("applies a replay with the merge rules after chat_messages already has the answer", () => {
		const merged = mergeCopilotServerTranscript(
			[{ id: "user-1", role: "user" as const, content: "edit cargo beans" }],
			[
				{ id: "user-1", role: "user", content: "edit cargo beans" },
				{
					id: "server-answer",
					role: "assistant",
					content: "after tool for edit cargo beans ",
				},
			],
		);
		let replayed = "";
		let current = merged;
		for (const delta of [
			"after ",
			"tool ",
			"for ",
			"edit ",
			"cargo ",
			"beans ",
		]) {
			replayed += delta;
			current = applyCopilotReplayText(current, replayed);
		}
		expect(current).toEqual(merged);
		expect(current[1]?.content).toBe("after tool for edit cargo beans ");
	});

	it("replaces a partial bubble from replay text instead of appending", () => {
		const start = [
			{ id: "user-1", role: "user" as const, content: "edit cargo beans" },
			{ id: "local-partial", role: "assistant" as const, content: "after " },
		];
		const next = applyCopilotReplayText(
			start,
			"after tool for edit cargo beans ",
		);
		expect(next).toEqual([
			{ id: "user-1", role: "user", content: "edit cargo beans" },
			{
				id: "local-partial",
				role: "assistant",
				content: "after tool for edit cargo beans ",
			},
		]);
	});

	it("keeps a preamble and appends the post-approval summary from a second assistant row", () => {
		const local = [
			{ id: "user-1", role: "user" as const, content: "preedit cargo beans" },
			{
				id: "local-preamble",
				role: "assistant" as const,
				content: "Let me update that for you. ",
			},
		];
		const merged = mergeCopilotServerTranscript(local, [
			{ id: "user-1", role: "user", content: "preedit cargo beans" },
			{
				id: "server-pause",
				role: "assistant",
				content: "Let me update that for you. ",
			},
			{
				id: "server-summary",
				role: "assistant",
				content: "after tool for preedit cargo beans ",
			},
		]);
		expect(merged).toEqual([
			{ id: "user-1", role: "user", content: "preedit cargo beans" },
			{
				id: "local-preamble",
				role: "assistant",
				content:
					"Let me update that for you. after tool for preedit cargo beans ",
			},
		]);
		const baseline = copilotTurnAssistantBaseline(local);
		expect(baseline).toBe("Let me update that for you. ");
		expect(
			applyCopilotReplayText(
				local,
				"after tool for preedit cargo beans ",
				baseline,
			),
		).toEqual(merged);
		expect(
			applyCopilotReplayText(local, "after tool for preedit cargo beans "),
		).toEqual(local);
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

	it("holds an approval pause that has not run the tool", () => {
		expect(
			copilotTurnUsageDecision({
				status: "completed",
				parts: [{ type: "tool-edit_cargo", state: "approval-requested" }],
			}),
		).toBe("hold");
	});

	it("commits once a tool part has output, including a stopped or errored turn", () => {
		expect(
			copilotTurnUsageDecision({
				status: "completed",
				parts: [{ type: "tool-edit_cargo", state: "output-available" }],
			}),
		).toBe("commit");
		expect(
			copilotTurnUsageDecision({
				status: "aborted",
				parts: [{ type: "tool-add_note", state: "output-available" }],
			}),
		).toBe("commit");
		expect(
			copilotTurnUsageDecision({
				status: "error",
				parts: [{ type: "tool-edit_cargo", state: "output-error" }],
			}),
		).toBe("commit");
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

	it("blocks a credit turn when the balance cannot cover the next bracket", () => {
		expect(
			copilotStepExceedsBalance({
				mode: "credits",
				totalTokens: 20_000,
				pendingTokens: 1,
				bracketCreditsCharged: 1,
				creditBalance: 0,
			}),
		).toBe(true);
		expect(
			copilotStepExceedsBalance({
				mode: "credits",
				totalTokens: 20_000,
				pendingTokens: 1,
				bracketCreditsCharged: 1,
				creditBalance: 1,
			}),
		).toBe(false);
		expect(
			copilotStepExceedsBalance({
				mode: "allowance",
				totalTokens: 40_000,
				pendingTokens: 0,
				bracketCreditsCharged: 1,
				creditBalance: 0,
			}),
		).toBe(false);
		expect(
			copilotStepExceedsBalance({
				mode: "onboarding_briefing",
				totalTokens: 40_000,
				pendingTokens: 0,
				bracketCreditsCharged: 0,
				creditBalance: 0,
			}),
		).toBe(false);
	});

	it("clears a billing block after a top-up and does not charge the canned reply", () => {
		expect(
			copilotBillingBlockAfterBalanceCheck({
				blocked: true,
				mode: "credits",
				totalTokens: 20_001,
				pendingTokens: 0,
				bracketCreditsCharged: 1,
				creditBalance: 10,
			}),
		).toBe(false);
		expect(
			copilotBillingBlockAfterBalanceCheck({
				blocked: true,
				mode: "credits",
				totalTokens: 20_001,
				pendingTokens: 0,
				bracketCreditsCharged: 1,
				creditBalance: 0,
			}),
		).toBe(true);
		expect(
			copilotTurnUsageDecision({
				status: "completed",
				parts: [
					{
						type: "text",
						text: "This conversation exhausted its credit allowance.",
					},
				],
				suppressCommit: true,
			}),
		).toBe("discard");
	});

	it("persists the billing block when credits are insufficient", () => {
		expect(
			copilotUsageAfterInsufficientCredits({
				billingBlocked: false,
				totalUsageTokens: 240,
			}),
		).toEqual({
			billingBlocked: true,
			totalUsageTokens: 240,
			persist: true,
		});
	});

	it("commits an abort after an approved tool ran, even with no answer text", () => {
		expect(
			copilotTurnUsageDecision({
				status: "aborted",
				parts: [{ type: "step-start" }],
				toolRan: true,
			}),
		).toBe("commit");
		expect(
			copilotTurnUsageDecision({
				status: "aborted",
				parts: [],
			}),
		).toBe("discard");
	});
});
