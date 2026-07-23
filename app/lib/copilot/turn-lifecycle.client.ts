export type CopilotTurnState = {
	status: "idle" | "active" | "awaiting_approval" | "stopping";
	activeRequestId: string | null;
};

export type CopilotTurnEvent =
	| { type: "started"; requestId: string }
	| { type: "approval_requested" }
	| { type: "approval_resolved"; approved: boolean }
	| { type: "stop_requested" }
	| { type: "ended" };

export const INITIAL_COPILOT_TURN_STATE: CopilotTurnState = {
	status: "idle",
	activeRequestId: null,
};

export function reduceCopilotTurnState(
	state: CopilotTurnState,
	event: CopilotTurnEvent,
): CopilotTurnState {
	switch (event.type) {
		case "started":
			if (state.status !== "idle") return state;
			return { status: "active", activeRequestId: event.requestId };
		case "approval_requested":
			if (state.status !== "active") return state;
			return { ...state, status: "awaiting_approval" };
		case "approval_resolved":
			if (state.status !== "awaiting_approval") return state;
			return event.approved
				? { ...state, status: "active" }
				: INITIAL_COPILOT_TURN_STATE;
		case "stop_requested":
			if (state.status !== "active" && state.status !== "awaiting_approval") {
				return state;
			}
			return { ...state, status: "stopping" };
		case "ended":
			// Always clear. Stream finish while parked on approval must not call
			// this event (AskPanel/iOS skip terminal endTurn / completeTurn).
			// Forced clear (disconnect, deny, stop) must reach idle.
			return INITIAL_COPILOT_TURN_STATE;
	}
}

export function isCopilotTurnActive(state: CopilotTurnState): boolean {
	return state.status === "active" || state.status === "stopping";
}
