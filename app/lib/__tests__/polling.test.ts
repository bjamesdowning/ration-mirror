import { describe, expect, it, vi } from "vitest";
import {
	POLL_BACKOFF_AFTER_MS,
	POLL_BACKOFF_INTERVAL_MS,
	POLL_INTERVAL_MS,
	pollDelayMs,
} from "../polling";

describe("pollDelayMs", () => {
	it("returns 0 before the first poll", () => {
		expect(pollDelayMs(0)).toBe(0);
	});

	it("uses the base interval until the backoff threshold", () => {
		expect(pollDelayMs(1)).toBe(POLL_INTERVAL_MS);
		const attemptsBeforeBackoff =
			Math.floor(POLL_BACKOFF_AFTER_MS / POLL_INTERVAL_MS) + 1;
		expect(pollDelayMs(attemptsBeforeBackoff)).toBe(POLL_INTERVAL_MS);
	});

	it("switches to backoff interval after ~10s of base polling", () => {
		const firstBackoffAttempt =
			Math.floor(POLL_BACKOFF_AFTER_MS / POLL_INTERVAL_MS) + 2;
		expect(pollDelayMs(firstBackoffAttempt)).toBe(POLL_BACKOFF_INTERVAL_MS);
		expect(pollDelayMs(40)).toBe(POLL_BACKOFF_INTERVAL_MS);
	});
});

describe("startBackoffPollLoop", () => {
	it("invokes poll immediately and cancels pending timeouts", async () => {
		vi.useFakeTimers();
		const poll = vi.fn().mockResolvedValue(undefined);
		const { startBackoffPollLoop } = await import("../polling");
		const cancel = startBackoffPollLoop(poll, { maxAttempts: 3 });
		await Promise.resolve();
		expect(poll).toHaveBeenCalledTimes(1);
		cancel();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(poll).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});
});
