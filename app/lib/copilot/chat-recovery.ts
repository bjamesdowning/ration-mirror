/**
 * Copilot stall / transient-error recovery policy for Think's durable chat
 * recovery (`chatRecovery`, `classifyChatError`, `onChatRecovery`).
 *
 * `chatRecovery` must be a class field: Think reads it before `onStart()` and
 * the same config governs deploy / eviction recovery. So the config here is
 * static, and the flag (`copilot-recovery-tuning`) only narrows the budget for
 * a turn that is live in the current isolate. Deploy recovery runs in a fresh
 * isolate, where `liveTurn` is false, so it keeps Think's default budget.
 */
import type {
	ChatErrorClassification,
	ChatRecoveryConfig,
	ChatRecoveryExhaustedContext,
	ChatRecoveryProgressContext,
} from "@cloudflare/think";
import { compareVersions } from "../client-version";
import type { CopilotOriginatingClient } from "./originating-client.server";

/** Shown when recovery gives up. No internals, no provider text. */
export const COPILOT_RECOVERY_TERMINAL_MESSAGE =
	"Ration took too long to answer. Try again, shorten the question, or switch to Deep.";

/** Flag on: at most one retry, and only within 60 seconds of the first stall. */
export const COPILOT_RECOVERY_TUNED_MAX_ATTEMPTS = 1;
export const COPILOT_RECOVERY_TUNED_MAX_AGE_MS = 60_000;

/** A turn started in this isolate within this window counts as live. */
export const COPILOT_RECOVERY_LIVE_TURN_WINDOW_MS = 10 * 60 * 1000;

/** First iOS build that renders the "retrying" state (R6). */
export const COPILOT_RECOVERY_IOS_MIN_VERSION = "1.6.40";

/** AI Gateway time-to-first-byte budget when the flag is on (below the Fast stall). */
export const COPILOT_GATEWAY_REQUEST_TIMEOUT_MS = 40_000;

export type CopilotRecoveryState = {
	/** `copilot-recovery-tuning`, cached by `beforeTurn` in this isolate. */
	tuningEnabled: boolean;
	/** A turn started in this isolate recently (not deploy recovery). */
	liveTurn: boolean;
};

export function isCopilotLiveTurn(
	lastTurnStartedAt: number,
	now: number,
): boolean {
	return (
		lastTurnStartedAt > 0 &&
		now - lastTurnStartedAt >= 0 &&
		now - lastTurnStartedAt < COPILOT_RECOVERY_LIVE_TURN_WINDOW_MS
	);
}

/**
 * Think calls this from the second recovery attempt onward. Flag off, or not
 * a live turn: keep Think's defaults (10 attempts / 5 min no-progress).
 */
export function shouldKeepCopilotRecovering(
	ctx: Pick<ChatRecoveryProgressContext, "attempt" | "ageMs">,
	state: CopilotRecoveryState,
): boolean {
	if (!state.tuningEnabled || !state.liveTurn) return true;
	return (
		ctx.attempt <= COPILOT_RECOVERY_TUNED_MAX_ATTEMPTS &&
		ctx.ageMs < COPILOT_RECOVERY_TUNED_MAX_AGE_MS
	);
}

export function createCopilotChatRecoveryConfig(input: {
	state: () => CopilotRecoveryState;
	onExhausted?: (ctx: ChatRecoveryExhaustedContext) => void | Promise<void>;
}): Exclude<ChatRecoveryConfig, true> {
	return {
		terminalMessage: COPILOT_RECOVERY_TERMINAL_MESSAGE,
		shouldKeepRecovering: (ctx) =>
			shouldKeepCopilotRecovering(ctx, input.state()),
		...(input.onExhausted ? { onExhausted: input.onExhausted } : {}),
	};
}

function statusCodeOf(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const direct = (error as { statusCode?: unknown }).statusCode;
	if (typeof direct === "number") return direct;
	const status = (error as { status?: unknown }).status;
	if (typeof status === "number") return status;
	const cause = (error as { cause?: unknown }).cause;
	if (cause && cause !== error) return statusCodeOf(cause);
	return undefined;
}

function messageOf(error: unknown): string {
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.message;
	return "";
}

const RATE_LIMIT_TEXT =
	/\b429\b|rate.?limit|resource.?exhausted|too many requests/i;
const TRANSIENT_TEXT =
	/\b50[0234]\b|service unavailable|bad gateway|gateway timeout|econnreset|socket hang up|fetch failed|upstream connect error/i;

/**
 * Flag on: 429 → `rate_limit`, 500/502/503/504 or a network reset →
 * `transient` (both route into the bounded recovery above). Anything else, or
 * flag off, keeps Think's terminal behaviour. Never logs the error body.
 */
export function classifyCopilotChatError(
	error: unknown,
	tuningEnabled: boolean,
): ChatErrorClassification | undefined {
	if (!tuningEnabled) return undefined;
	const status = statusCodeOf(error);
	if (status === 429) return "rate_limit";
	if (status === 500 || status === 502 || status === 503 || status === 504) {
		return "transient";
	}
	if (status !== undefined) return undefined;
	const message = messageOf(error);
	if (RATE_LIMIT_TEXT.test(message)) return "rate_limit";
	if (TRANSIENT_TEXT.test(message)) return "transient";
	return undefined;
}

export const COPILOT_FINAL_STEP_NOTICE =
	"This is your final step. Do not call tools. Answer the user now, or say clearly what you could not finish.";

/** Last allowed step: no tools, answer now. `undefined` before that. */
export function copilotFinalStepConfig(input: {
	stepNumber: number;
	maxSteps: number;
	system: string;
}): { activeTools: string[]; toolChoice: "none"; system: string } | undefined {
	if (input.maxSteps <= 1) return undefined;
	if (input.stepNumber < input.maxSteps - 1) return undefined;
	return {
		activeTools: [],
		toolChoice: "none",
		system: `${input.system}\n\n${COPILOT_FINAL_STEP_NOTICE}`,
	};
}

type ResponsePart = { type?: string; state?: string; text?: string };

/**
 * A completed turn with no answer text, no tool output, and no approval
 * pause. Used for the `copilot_empty_turn` metric only.
 */
export function isCopilotEmptyTurn(input: {
	status: string;
	parts: readonly unknown[];
}): boolean {
	if (input.status !== "completed") return false;
	for (const raw of input.parts) {
		const part = (raw ?? {}) as ResponsePart;
		if (part.type === "text" && (part.text ?? "").trim().length > 0) {
			return false;
		}
		if (typeof part.type === "string" && part.type.startsWith("tool-")) {
			return false;
		}
		if (part.type === "dynamic-tool") return false;
		if (part.state === "approval-requested") return false;
	}
	return true;
}

/**
 * iOS builds before 1.6.40 drop frames after a `done + outcome:"recovering"`
 * frame, so the retry and the terminal message never render. Those builds get
 * an immediate stall message instead (R6). An iOS client without a parseable
 * version is treated as old (it only changes which message they see).
 */
export function copilotClientNeedsStallDecline(
	client: CopilotOriginatingClient,
): boolean {
	if (client.clientPlatform !== "ios") return false;
	if (!client.clientVersion) return true;
	const order = compareVersions(
		client.clientVersion,
		COPILOT_RECOVERY_IOS_MIN_VERSION,
	);
	return order === null || order < 0;
}
