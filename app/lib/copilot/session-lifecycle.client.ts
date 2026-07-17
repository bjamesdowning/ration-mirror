import type { CopilotTurnState } from "./turn-lifecycle.client";
import { INITIAL_COPILOT_TURN_STATE } from "./turn-lifecycle.client";

/**
 * Close/X backgrounds the chat: cancel any in-flight turn, force idle,
 * keep conversationId + transcript for short-term resume.
 */
export function backgroundCopilotSession(turnState: CopilotTurnState): {
	turnState: CopilotTurnState;
	shouldCancelActiveRequest: boolean;
} {
	const shouldCancelActiveRequest =
		turnState.status === "active" ||
		turnState.status === "stopping" ||
		turnState.status === "awaiting_approval";
	return {
		turnState: INITIAL_COPILOT_TURN_STATE,
		shouldCancelActiveRequest,
	};
}

export function canResumeCopilotSession(
	lastActivityAt: number,
	now: number,
	sessionIdleMs: number,
): boolean {
	if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) return false;
	if (!Number.isFinite(sessionIdleMs) || sessionIdleMs <= 0) return false;
	return now - lastActivityAt <= sessionIdleMs;
}

/**
 * Before send after a background/reconnect: clear a stuck non-idle turn when
 * the socket is dead so the composer can open a fresh connection.
 */
export function prepareCopilotSendAfterResume(input: {
	turnState: CopilotTurnState;
	socketOpen: boolean;
}): { turnState: CopilotTurnState; shouldForceIdle: boolean } {
	if (input.socketOpen) {
		return { turnState: input.turnState, shouldForceIdle: false };
	}
	if (input.turnState.status === "idle") {
		return { turnState: input.turnState, shouldForceIdle: false };
	}
	return {
		turnState: INITIAL_COPILOT_TURN_STATE,
		shouldForceIdle: true,
	};
}

/**
 * Dock composer (sheet closed) with an existing transcript starts a new chat.
 * Sheet-open sends continue the same conversation. Shared policy for iOS dock
 * (and any future web collapsed composer).
 */
export function shouldStartNewChatFromCollapsedBar(input: {
	sheetPresented: boolean;
	messageCount: number;
}): boolean {
	if (input.sheetPresented) return false;
	return input.messageCount > 0;
}
