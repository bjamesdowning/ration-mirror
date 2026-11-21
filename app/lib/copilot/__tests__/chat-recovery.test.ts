/** Flag `copilot-recovery-tuning`: Think chat recovery policy for Copilot. */
import { resolveChatRecoveryConfig } from "agents/chat";
import { describe, expect, it, vi } from "vitest";
import {
	COPILOT_FINAL_STEP_NOTICE,
	COPILOT_RECOVERY_LIVE_TURN_WINDOW_MS,
	COPILOT_RECOVERY_TERMINAL_MESSAGE,
	classifyCopilotChatError,
	copilotClientNeedsStallDecline,
	copilotFinalStepConfig,
	createCopilotChatRecoveryConfig,
	isCopilotEmptyTurn,
	isCopilotLiveTurn,
	shouldKeepCopilotRecovering,
} from "../chat-recovery";

const progress = (attempt: number, ageMs: number) => ({
	incidentId: "i",
	requestId: "r",
	recoveryRootRequestId: "r",
	attempt,
	maxAttempts: 10,
	recoveryKind: "retry" as const,
	work: 0,
	ageMs,
});

describe("createCopilotChatRecoveryConfig", () => {
	it("keeps Think's attempt and no-progress defaults and sets the terminal copy", () => {
		const config = resolveChatRecoveryConfig(
			createCopilotChatRecoveryConfig({
				state: () => ({ tuningEnabled: false, liveTurn: false }),
			}),
		);
		expect(config.maxAttempts).toBe(10);
		expect(config.noProgressTimeoutMs).toBe(300_000);
		expect(config.terminalMessage).toBe(COPILOT_RECOVERY_TERMINAL_MESSAGE);
		expect(config.shouldKeepRecovering).toBeTypeOf("function");
	});

	it("flag on + live turn: one retry, then stop (Think asks from attempt 2)", async () => {
		const config = createCopilotChatRecoveryConfig({
			state: () => ({ tuningEnabled: true, liveTurn: true }),
		});
		expect(await config.shouldKeepRecovering?.(progress(1, 5_000))).toBe(true);
		expect(await config.shouldKeepRecovering?.(progress(2, 5_000))).toBe(false);
		expect(await config.shouldKeepRecovering?.(progress(1, 60_000))).toBe(
			false,
		);
	});

	it("flag off keeps recovering (Think's own bounds apply)", async () => {
		const config = createCopilotChatRecoveryConfig({
			state: () => ({ tuningEnabled: false, liveTurn: true }),
		});
		expect(await config.shouldKeepRecovering?.(progress(5, 200_000))).toBe(
			true,
		);
	});

	it("deploy / eviction recovery (not a live turn) keeps defaults even with the flag on", () => {
		expect(
			shouldKeepCopilotRecovering(progress(3, 120_000), {
				tuningEnabled: true,
				liveTurn: false,
			}),
		).toBe(true);
	});

	it("reads state lazily on every call", async () => {
		const state = vi.fn(() => ({ tuningEnabled: true, liveTurn: true }));
		const config = createCopilotChatRecoveryConfig({ state });
		expect(state).not.toHaveBeenCalled();
		await config.shouldKeepRecovering?.(progress(2, 1));
		expect(state).toHaveBeenCalledTimes(1);
	});

	it("passes onExhausted through", () => {
		const onExhausted = vi.fn();
		const config = createCopilotChatRecoveryConfig({
			state: () => ({ tuningEnabled: true, liveTurn: true }),
			onExhausted,
		});
		expect(config.onExhausted).toBe(onExhausted);
	});
});

describe("isCopilotLiveTurn", () => {
	it("is false after a fresh wake and true inside the window", () => {
		expect(isCopilotLiveTurn(0, 1_000)).toBe(false);
		expect(isCopilotLiveTurn(1_000, 2_000)).toBe(true);
		expect(
			isCopilotLiveTurn(1_000, 1_000 + COPILOT_RECOVERY_LIVE_TURN_WINDOW_MS),
		).toBe(false);
	});
});

describe("classifyCopilotChatError", () => {
	it("returns undefined with the flag off", () => {
		expect(
			classifyCopilotChatError({ statusCode: 429 }, false),
		).toBeUndefined();
	});

	it.each([
		[{ statusCode: 429 }, "rate_limit"],
		[{ statusCode: 503 }, "transient"],
		[{ statusCode: 502 }, "transient"],
		[{ status: 504 }, "transient"],
		[{ cause: { statusCode: 500 } }, "transient"],
		[{ statusCode: 400 }, undefined],
		[{ statusCode: 401 }, undefined],
		[new Error("RESOURCE_EXHAUSTED: quota"), "rate_limit"],
		[new Error("fetch failed"), "transient"],
		["ECONNRESET", "transient"],
		[new Error("Invalid argument"), undefined],
	])("%j → %s", (error, expected) => {
		expect(classifyCopilotChatError(error, true)).toBe(expected);
	});
});

describe("copilotFinalStepConfig", () => {
	it("forces a tool-free answer on the last allowed step only", () => {
		expect(
			copilotFinalStepConfig({ stepNumber: 3, maxSteps: 6, system: "S" }),
		).toBeUndefined();
		expect(
			copilotFinalStepConfig({ stepNumber: 5, maxSteps: 6, system: "S" }),
		).toEqual({
			activeTools: [],
			toolChoice: "none",
			system: `S\n\n${COPILOT_FINAL_STEP_NOTICE}`,
		});
		expect(
			copilotFinalStepConfig({ stepNumber: 0, maxSteps: 1, system: "S" }),
		).toBeUndefined();
	});
});

describe("isCopilotEmptyTurn", () => {
	it("is true for a completed turn with no text or tools", () => {
		expect(
			isCopilotEmptyTurn({
				status: "completed",
				parts: [{ type: "step-start" }, { type: "text", text: "  " }],
			}),
		).toBe(true);
	});

	it("is false for text, tools, approval pauses, or non-completed turns", () => {
		expect(
			isCopilotEmptyTurn({
				status: "completed",
				parts: [{ type: "text", text: "Done." }],
			}),
		).toBe(false);
		expect(
			isCopilotEmptyTurn({
				status: "completed",
				parts: [{ type: "tool-list_inventory", state: "output-available" }],
			}),
		).toBe(false);
		expect(
			isCopilotEmptyTurn({
				status: "completed",
				parts: [{ type: "x", state: "approval-requested" }],
			}),
		).toBe(false);
		expect(isCopilotEmptyTurn({ status: "aborted", parts: [] })).toBe(false);
	});
});

describe("copilotClientNeedsStallDecline", () => {
	it.each([
		[{ clientPlatform: "ios", clientVersion: "1.6.39" }, true],
		[{ clientPlatform: "ios", clientVersion: "1.6.40" }, false],
		[{ clientPlatform: "ios", clientVersion: "1.7.0" }, false],
		[{ clientPlatform: "ios" }, true],
		[{ clientPlatform: "web" }, false],
	] as const)("%j → %s", (client, expected) => {
		expect(copilotClientNeedsStallDecline(client as never)).toBe(expected);
	});
});
