import { describe, expect, it } from "vitest";
import { shouldApplyCopilotServerTranscript } from "../copilot/stream-resume.client";
import {
	copilotCancelRequestIds,
	INITIAL_COPILOT_TURN_STATE,
	isCopilotTurnActive,
	reduceCopilotTurnState,
	shouldIgnoreCopilotTurnEnd,
} from "../copilot/turn-lifecycle.client";

describe("Copilot turn lifecycle", () => {
	it("becomes ready for a second turn after completion", () => {
		const active = reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
			type: "started",
			requestId: "request-1",
		});
		const ended = reduceCopilotTurnState(active, { type: "ended" });
		const secondTurn = reduceCopilotTurnState(ended, {
			type: "started",
			requestId: "request-2",
		});

		expect(isCopilotTurnActive(ended)).toBe(false);
		expect(secondTurn).toEqual({
			...INITIAL_COPILOT_TURN_STATE,
			status: "active",
			activeRequestId: "request-2",
		});
	});

	it("makes repeated terminal events idempotent", () => {
		const ended = reduceCopilotTurnState(
			reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
				type: "started",
				requestId: "request-1",
			}),
			{ type: "ended" },
		);

		expect(reduceCopilotTurnState(ended, { type: "ended" })).toEqual(
			INITIAL_COPILOT_TURN_STATE,
		);
	});

	it("locks ordinary sending while approval is pending", () => {
		const awaiting = reduceCopilotTurnState(
			reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
				type: "started",
				requestId: "request-1",
			}),
			{ type: "approval_requested" },
		);

		expect(awaiting.status).toBe("awaiting_approval");
		expect(
			reduceCopilotTurnState(awaiting, {
				type: "started",
				requestId: "request-2",
			}),
		).toEqual(awaiting);
	});

	it("accepts late approval requests when idle", () => {
		const late = reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
			type: "approval_requested",
			requestId: "pause-1",
		});
		expect(late.status).toBe("awaiting_approval");
		expect(late.pauseRequestId).toBe("pause-1");
	});

	it("ignores approval requests while stopping", () => {
		const stopping = reduceCopilotTurnState(
			reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
				type: "started",
				requestId: "request-1",
			}),
			{ type: "stop_requested" },
		);

		expect(
			reduceCopilotTurnState(stopping, { type: "approval_requested" }),
		).toEqual(stopping);
	});

	it("stops once and releases the turn on terminal events", () => {
		const active = reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
			type: "started",
			requestId: "request-1",
		});
		const stopping = reduceCopilotTurnState(active, {
			type: "stop_requested",
		});

		expect(stopping.status).toBe("stopping");
		expect(
			reduceCopilotTurnState(stopping, { type: "stop_requested" }),
		).toEqual(stopping);
		expect(reduceCopilotTurnState(stopping, { type: "ended" })).toEqual(
			INITIAL_COPILOT_TURN_STATE,
		);
	});

	it("clears awaiting approval on ended so forced clear can unlock chat", () => {
		const awaiting = reduceCopilotTurnState(
			reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
				type: "started",
				requestId: "request-1",
			}),
			{ type: "approval_requested" },
		);

		expect(reduceCopilotTurnState(awaiting, { type: "ended" })).toEqual(
			INITIAL_COPILOT_TURN_STATE,
		);
	});

	it("allows stop while approval is pending", () => {
		const awaiting = reduceCopilotTurnState(
			reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
				type: "started",
				requestId: "request-1",
			}),
			{ type: "approval_requested" },
		);

		expect(
			reduceCopilotTurnState(awaiting, { type: "stop_requested" }).status,
		).toBe("stopping");
	});

	it("ignores pause-stream terminals after approve until continuation activity", () => {
		const awaiting = reduceCopilotTurnState(
			reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
				type: "started",
				requestId: "request-1",
			}),
			{ type: "approval_requested", requestId: "pause-1" },
		);
		const approved = reduceCopilotTurnState(awaiting, {
			type: "approval_resolved",
			approved: true,
		});

		expect(approved.expectingApprovalContinuation).toBe(true);
		expect(isCopilotTurnActive(approved)).toBe(true);
		expect(shouldIgnoreCopilotTurnEnd(approved, "pause-1")).toBe(true);
		expect(shouldIgnoreCopilotTurnEnd(approved, null)).toBe(true);

		const withActivity = reduceCopilotTurnState(approved, {
			type: "post_approval_activity",
		});
		expect(shouldIgnoreCopilotTurnEnd(withActivity, "pause-1")).toBe(true);
		expect(shouldIgnoreCopilotTurnEnd(withActivity, "continuation-2")).toBe(
			false,
		);
	});

	it("cancels the resumed continuation id as well as the original request", () => {
		const approved = reduceCopilotTurnState(
			reduceCopilotTurnState(
				reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
					type: "started",
					requestId: "be5807c4",
				}),
				{ type: "approval_requested", requestId: "be5807c4" },
			),
			{ type: "approval_resolved", approved: true },
		);
		const resumed = reduceCopilotTurnState(approved, {
			type: "continuation_started",
			requestId: "6ed6aa78",
		});
		expect(copilotCancelRequestIds(resumed)).toEqual(["be5807c4", "6ed6aa78"]);
		expect(
			copilotCancelRequestIds(
				reduceCopilotTurnState(resumed, { type: "stop_requested" }),
			),
		).toEqual(["be5807c4", "6ed6aa78"]);
		expect(
			copilotCancelRequestIds(
				reduceCopilotTurnState(resumed, { type: "ended" }),
			),
		).toEqual([]);
		expect(
			reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
				type: "continuation_started",
				requestId: "late",
			}),
		).toEqual(INITIAL_COPILOT_TURN_STATE);
	});

	it("keeps the turn active after Deny so the charged reply can be shown", () => {
		const awaiting = reduceCopilotTurnState(
			reduceCopilotTurnState(INITIAL_COPILOT_TURN_STATE, {
				type: "started",
				requestId: "request-1",
			}),
			{ type: "approval_requested", requestId: "request-1" },
		);
		const denied = reduceCopilotTurnState(awaiting, {
			type: "approval_resolved",
			approved: false,
		});
		expect(denied.status).toBe("active");
		expect(denied.expectingApprovalContinuation).toBe(true);
		expect(denied.activeRequestId).toBe("request-1");
		expect(isCopilotTurnActive(denied)).toBe(true);
		expect(shouldApplyCopilotServerTranscript(denied)).toBe(true);
		expect(shouldIgnoreCopilotTurnEnd(denied, "request-1")).toBe(true);
	});
});
