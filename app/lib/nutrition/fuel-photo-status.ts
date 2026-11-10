/** Client-facing Fuel photo states. `uploading` exists only before the row. */

export const FUEL_PHOTO_POLL_FIRST_MS = 1_500;
export const FUEL_PHOTO_POLL_NEXT_MS = 3_000;
export const FUEL_PHOTO_POLL_MAX_ATTEMPTS = 40;
export const FUEL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type FuelPhotoClientStatus =
	| "queued"
	| "analyzing"
	| "ready_to_review"
	| "failed"
	| "expired";

export function fuelPhotoClientStatus(input: {
	queueStatus: "pending" | "processing" | "completed" | "failed";
	expiresAt: Date;
	now: Date;
	readyAt?: Date | null;
}): FuelPhotoClientStatus {
	if (input.queueStatus === "completed") {
		if (
			input.readyAt &&
			input.now.getTime() - input.readyAt.getTime() >= FUEL_DRAFT_TTL_MS
		) {
			return "expired";
		}
		return "ready_to_review";
	}
	if (input.queueStatus === "failed") return "failed";
	if (input.now.getTime() >= input.expiresAt.getTime()) return "expired";
	if (input.queueStatus === "processing") return "analyzing";
	return "queued";
}

/** 1.5s, then 3s, stop after 40 attempts. */
export function fuelPhotoPollDelayMs(attempt: number): number | null {
	if (attempt < 1 || attempt > FUEL_PHOTO_POLL_MAX_ATTEMPTS) return null;
	return attempt === 1 ? FUEL_PHOTO_POLL_FIRST_MS : FUEL_PHOTO_POLL_NEXT_MS;
}
