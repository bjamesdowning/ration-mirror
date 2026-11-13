import {
	FUEL_PHOTO_POLL_MAX_ATTEMPTS,
	fuelPhotoPollDelayMs,
} from "./fuel-photo-status";

export type FuelPhotoPollLine = {
	name?: string;
	amount?: number;
	unit?: string;
	energyKcal?: number;
	proteinG?: number;
	carbsG?: number;
	fatG?: number;
};

export type FuelPhotoPollResult = {
	requestId: string;
	status: string;
	lines: FuelPhotoPollLine[] | null;
	error?: string;
};

/** Longest side stays at most `maxSide` pixels. Smaller frames are unchanged. */
export function fuelPhotoPixelSize(
	width: number,
	height: number,
	maxSide = 1024,
): { width: number; height: number } {
	const longest = Math.max(width, height);
	if (!Number.isFinite(longest) || longest <= maxSide || longest <= 0) {
		return { width, height };
	}
	const scale = maxSide / longest;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

export type FuelPhotoClientFailure =
	| { kind: "crew" }
	| { kind: "credits" }
	| { kind: "message"; message: string };

/** The caption the Fuel photo screen shows. The free-day cap stays the Crew paywall. */
export function fuelPhotoClientFailure(
	status: number,
	body: { code?: string; error?: string } | null,
): FuelPhotoClientFailure {
	const code = body?.code ?? "";
	if (code === "fuel_daily_limit") return { kind: "crew" };
	if (status === 402 || code === "insufficient_credits") return { kind: "credits" };
	if (code === "photo_too_large") {
		return {
			kind: "message",
			message: body?.error || "Photo must be 3 MiB or smaller.",
		};
	}
	if (code === "FEATURE_DISABLED") {
		return { kind: "message", message: "Photo food log is unavailable." };
	}
	if (
		code === "consent_required" ||
		code === "ai_consent_required" ||
		code === "nutrition_consent_required"
	) {
		return {
			kind: "message",
			message: body?.error || "Photo log needs consent.",
		};
	}
	if (status === 429) {
		return {
			kind: "message",
			message: body?.error || "Too many requests. Please try again later.",
		};
	}
	return {
		kind: "message",
		message: body?.error || "That photo was not queued.",
	};
}

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
		onStatus?: (status: string) => void;
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
		if (!response.ok) {
			const code =
				body && "code" in body && typeof body.code === "string"
					? body.code
					: undefined;
			if (response.status === 404 || (response.status >= 400 && response.status < 500)) {
				return {
					requestId,
					status: "failed",
					lines: null,
					error: code ?? `http_${response.status}`,
				};
			}
			continue;
		}
		if (body && "status" in body && typeof body.status === "string") {
			last = {
				requestId,
				status: body.status,
				lines: Array.isArray(body.lines) ? body.lines : null,
			};
			options.onStatus?.(last.status);
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
