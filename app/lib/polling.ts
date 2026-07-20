/**
 * Shared constants for AI queue status polling.
 * Used by scan, meal-generate, plan-week, and import-URL features.
 */
export const POLL_INTERVAL_MS = 1500;
/** After this elapsed budget, switch to a slower interval (P1-G). */
export const POLL_BACKOFF_AFTER_MS = 10_000;
export const POLL_BACKOFF_INTERVAL_MS = 3_000;
export const MAX_POLL_ATTEMPTS = 80; // ~120s+ with backoff for AI processing

/**
 * Delay before the next poll. `attemptIndex` is 0-based completed polls
 * (delay applies before attempts 1..n). First poll has no delay.
 */
export function pollDelayMs(attemptIndex: number): number {
	if (attemptIndex <= 0) return 0;
	const approxElapsedMs = (attemptIndex - 1) * POLL_INTERVAL_MS;
	return approxElapsedMs >= POLL_BACKOFF_AFTER_MS
		? POLL_BACKOFF_INTERVAL_MS
		: POLL_INTERVAL_MS;
}

/**
 * Schedule an immediate poll, then backoff-aware timeouts until cancelled
 * or `maxAttempts` is reached. Callers should clear their poll id inside
 * `poll` when the job completes so the next scheduled tick becomes a no-op
 * via React effect cleanup.
 */
export function startBackoffPollLoop(
	poll: () => void | Promise<void>,
	options?: { maxAttempts?: number },
): () => void {
	const maxAttempts = options?.maxAttempts ?? MAX_POLL_ATTEMPTS;
	let attempt = 0;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let cancelled = false;

	const scheduleNext = () => {
		if (cancelled || attempt >= maxAttempts) return;
		timeoutId = setTimeout(() => {
			void run();
		}, pollDelayMs(attempt));
	};

	const run = async () => {
		if (cancelled) return;
		attempt += 1;
		try {
			await poll();
		} finally {
			if (!cancelled && attempt < maxAttempts) {
				scheduleNext();
			}
		}
	};

	void run();

	return () => {
		cancelled = true;
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	};
}
