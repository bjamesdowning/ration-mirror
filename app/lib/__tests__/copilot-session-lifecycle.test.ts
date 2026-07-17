import { describe, expect, it } from "vitest";
import {
	backgroundCopilotSession,
	canResumeCopilotSession,
	prepareCopilotSendAfterResume,
	shouldStartNewChatFromCollapsedBar,
} from "../copilot/session-lifecycle.client";
import { INITIAL_COPILOT_TURN_STATE } from "../copilot/turn-lifecycle.client";

describe("backgroundCopilotSession", () => {
	it("forces idle and requests cancel when a turn is active", () => {
		const result = backgroundCopilotSession({
			status: "active",
			activeRequestId: "req-1",
		});
		expect(result.turnState).toEqual(INITIAL_COPILOT_TURN_STATE);
		expect(result.shouldCancelActiveRequest).toBe(true);
	});

	it("does not request cancel when already idle", () => {
		const result = backgroundCopilotSession(INITIAL_COPILOT_TURN_STATE);
		expect(result.shouldCancelActiveRequest).toBe(false);
	});
});

describe("canResumeCopilotSession", () => {
	it("allows resume within the idle window", () => {
		expect(
			canResumeCopilotSession(1_000, 1_000 + 19 * 60_000, 20 * 60_000),
		).toBe(true);
	});

	it("rejects resume after the idle window", () => {
		expect(
			canResumeCopilotSession(1_000, 1_000 + 21 * 60_000, 20 * 60_000),
		).toBe(false);
	});
});

describe("prepareCopilotSendAfterResume", () => {
	it("forces idle when the socket is dead and the turn is stuck", () => {
		const result = prepareCopilotSendAfterResume({
			turnState: { status: "active", activeRequestId: "req-1" },
			socketOpen: false,
		});
		expect(result.shouldForceIdle).toBe(true);
		expect(result.turnState).toEqual(INITIAL_COPILOT_TURN_STATE);
	});

	it("leaves an open socket alone", () => {
		const turnState = { status: "active" as const, activeRequestId: "req-1" };
		const result = prepareCopilotSendAfterResume({
			turnState,
			socketOpen: true,
		});
		expect(result.shouldForceIdle).toBe(false);
		expect(result.turnState).toBe(turnState);
	});
});

describe("shouldStartNewChatFromCollapsedBar", () => {
	it("starts a new chat when the sheet is closed with prior messages", () => {
		expect(
			shouldStartNewChatFromCollapsedBar({
				sheetPresented: false,
				messageCount: 2,
			}),
		).toBe(true);
	});

	it("continues the same chat when the sheet is open", () => {
		expect(
			shouldStartNewChatFromCollapsedBar({
				sheetPresented: true,
				messageCount: 2,
			}),
		).toBe(false);
	});

	it("does not start a new chat for an empty transcript", () => {
		expect(
			shouldStartNewChatFromCollapsedBar({
				sheetPresented: false,
				messageCount: 0,
			}),
		).toBe(false);
	});
});
