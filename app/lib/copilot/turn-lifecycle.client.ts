export type CopilotTurnState = {
	status: "idle" | "active" | "awaiting_approval" | "stopping";
	activeRequestId: string | null;
	/** Request id from `cf_agent_stream_resuming` / a continuation done frame. */
	continuationRequestId: string | null;
	/** Frame/request id of the stream that paused for approval (pause terminals). */
	pauseRequestId: string | null;
	/**
	 * After Approve, ignore pause-stream finish/done until the autoContinue
	 * stream delivers tool/text activity (or a terminal with a new request id).
	 */
	expectingApprovalContinuation: boolean;
	/** True once post-approve tool_end / text / reasoning arrived. */
	seenPostApprovalActivity: boolean;
};

export type CopilotTurnEvent =
	| { type: "started"; requestId: string }
	| { type: "continuation_started"; requestId: string }
	| { type: "approval_requested"; requestId?: string | null }
	| { type: "approval_resolved"; approved: boolean }
	| { type: "post_approval_activity" }
	| { type: "stop_requested" }
	| { type: "ended" };

export const INITIAL_COPILOT_TURN_STATE: CopilotTurnState = {
	status: "idle",
	activeRequestId: null,
	continuationRequestId: null,
	pauseRequestId: null,
	expectingApprovalContinuation: false,
	seenPostApprovalActivity: false,
};

export function reduceCopilotTurnState(
	state: CopilotTurnState,
	event: CopilotTurnEvent,
): CopilotTurnState {
	switch (event.type) {
		case "started":
			if (state.status !== "idle") return state;
			return {
				...INITIAL_COPILOT_TURN_STATE,
				status: "active",
				activeRequestId: event.requestId,
			};
		case "continuation_started":
			if (state.status === "idle") return state;
			if (state.continuationRequestId === event.requestId) return state;
			return { ...state, continuationRequestId: event.requestId };
		case "approval_requested":
			// Accept while active, or late when idle (missed earlier frame).
			if (state.status !== "active" && state.status !== "idle") return state;
			return {
				...state,
				status: "awaiting_approval",
				activeRequestId: state.activeRequestId ?? event.requestId ?? null,
				pauseRequestId: event.requestId ?? state.activeRequestId,
				expectingApprovalContinuation: false,
				seenPostApprovalActivity: false,
			};
		case "approval_resolved":
			if (state.status !== "awaiting_approval") return state;
			// Deny still auto-continues. Think writes a reply and charges it,
			// so the turn stays active until that reply arrives.
			return {
				...state,
				status: "active",
				expectingApprovalContinuation: true,
				seenPostApprovalActivity: false,
			};
		case "post_approval_activity":
			if (!state.expectingApprovalContinuation) return state;
			return { ...state, seenPostApprovalActivity: true };
		case "stop_requested":
			if (state.status !== "active" && state.status !== "awaiting_approval") {
				return state;
			}
			return {
				...state,
				status: "stopping",
				expectingApprovalContinuation: false,
				seenPostApprovalActivity: false,
			};
		case "ended":
			// Always clear. Callers must soft-ignore terminals via
			// shouldIgnoreCopilotTurnEnd before dispatching ended.
			return INITIAL_COPILOT_TURN_STATE;
	}
}

/**
 * Whether a stream terminal (finish/done / turn_end / message_end) should be
 * ignored so the Approve→autoContinue continuation can still deliver text.
 */
export function shouldIgnoreCopilotTurnEnd(
	state: CopilotTurnState,
	requestId?: string | null,
): boolean {
	if (state.status === "awaiting_approval") return true;
	if (!state.expectingApprovalContinuation) return false;
	if (!state.seenPostApprovalActivity) return true;
	if (
		requestId != null &&
		state.pauseRequestId != null &&
		requestId === state.pauseRequestId
	) {
		return true;
	}
	return false;
}

/** Original request id plus the resumed continuation id, without duplicates. */
export function copilotCancelRequestIds(state: CopilotTurnState): string[] {
	const ids: string[] = [];
	if (state.activeRequestId) ids.push(state.activeRequestId);
	if (
		state.continuationRequestId &&
		state.continuationRequestId !== state.activeRequestId
	) {
		ids.push(state.continuationRequestId);
	}
	return ids;
}

export function isCopilotTurnActive(state: CopilotTurnState): boolean {
	return (
		state.status === "active" ||
		state.status === "stopping" ||
		state.expectingApprovalContinuation
	);
}
