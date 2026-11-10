import {
	FUEL_PHOTO_POLL_MAX_ATTEMPTS,
	fuelPhotoPollDelayMs,
} from "./fuel-photo-status";

export type FuelPhotoPollResult = {
	requestId: string;
	status: string;
	lines: Array<{
		name?: string;
		energyKcal?: number;
		proteinG?: number;
		carbsG?: number;
		fatG?: number;
	}> | null;
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * Poll a Fuel photo. The first wait is 1.5s and every later wait is 3s.
 * Stops after 40 attempts, or when `signal` aborts because the screen left.
 */
export async function pollFuelPhoto(
	requestId: string,
	options: {
		signal: AbortSignal;
		fetchImpl?: typeof fetch;
		sleepImpl?: (ms: number, signal: AbortSignal) => Promise<void>;
	},
): Promise<FuelPhotoPollResult> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const wait = options.sleepImpl ?? sleep;
	let last: FuelPhotoPollResult = {
		requestId,
		status: "queued",
		lines: null,
	};
	for (let attempt = 1; attempt <= FUEL_PHOTO_POLL_MAX_ATTEMPTS; attempt += 1) {
		const delay = fuelPhotoPollDelayMs(attempt);
		if (delay == null) break;
		await wait(delay, options.signal);
		const response = await fetchImpl(
			`/api/nutrition/diary/photo/${requestId}`,
			{ credentials: "same-origin", signal: options.signal },
		);
		const body = (await response.json().catch(() => null)) as
			| FuelPhotoPollResult
			| { code?: string }
			| null;
		if (body && "status" in body && typeof body.status === "string") {
			last = {
				requestId,
				status: body.status,
				lines: Array.isArray(body.lines) ? body.lines : null,
			};
			if (
				last.status === "ready_to_review" ||
				last.status === "failed" ||
				last.status === "expired"
			) {
				return last;
			}
		}
	}
	return last;
}
