import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { UserSettings } from "./types";

/** Days without Hub, API, or MCP activity before a re-engagement email. */
export const INACTIVITY_DAYS = 30;

/** Minimum days between re-engagement emails to the same user. */
export const REENGAGEMENT_EMAIL_COOLDOWN_DAYS = 30;

/** Skip redundant lastActiveAt writes when touched recently. */
export const ACTIVITY_TOUCH_THROTTLE_MS = 6 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ActivitySnapshot {
	sessionUpdatedAtMs: number;
	apiKeyLastUsedAtMs: number;
	settingsLastActiveAtMs: number;
}

export function computeLastActiveAtMs(snapshot: ActivitySnapshot): number {
	return Math.max(
		snapshot.sessionUpdatedAtMs,
		snapshot.apiKeyLastUsedAtMs,
		snapshot.settingsLastActiveAtMs,
	);
}

export function isEligibleForReengagementEmail(input: {
	lastActiveAtMs: number;
	userCreatedAtMs: number;
	reengagementEmailSentAt?: string | null;
	nowMs: number;
	inactivityMs?: number;
	emailCooldownMs?: number;
}): boolean {
	const inactivityMs = input.inactivityMs ?? INACTIVITY_DAYS * MS_PER_DAY;
	const emailCooldownMs =
		input.emailCooldownMs ?? REENGAGEMENT_EMAIL_COOLDOWN_DAYS * MS_PER_DAY;
	const inactiveCutoff = input.nowMs - inactivityMs;

	if (input.userCreatedAtMs > inactiveCutoff) return false;
	if (input.lastActiveAtMs >= inactiveCutoff) return false;

	if (input.reengagementEmailSentAt) {
		const sentAt = new Date(input.reengagementEmailSentAt).getTime();
		if (!Number.isNaN(sentAt) && sentAt >= input.nowMs - emailCooldownMs) {
			return false;
		}
	}

	return true;
}

export function getReengagementCutoffUnix(nowMs: number): {
	inactiveCutoffUnix: number;
	emailCooldownCutoffUnix: number;
} {
	return {
		inactiveCutoffUnix: Math.floor(
			(nowMs - INACTIVITY_DAYS * MS_PER_DAY) / 1000,
		),
		emailCooldownCutoffUnix: Math.floor(
			(nowMs - REENGAGEMENT_EMAIL_COOLDOWN_DAYS * MS_PER_DAY) / 1000,
		),
	};
}

export function shouldTouchLastActive(
	lastActiveAtIso: string | undefined,
	now: Date,
	throttleMs = ACTIVITY_TOUCH_THROTTLE_MS,
): boolean {
	if (!lastActiveAtIso) return true;
	const last = new Date(lastActiveAtIso).getTime();
	if (Number.isNaN(last)) return true;
	return now.getTime() - last >= throttleMs;
}

export function timestampToMs(value: unknown): number {
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") {
		return value < 1_000_000_000_000 ? value * 1000 : value;
	}
	return 0;
}

/**
 * Throttled write of lastActiveAt into user.settings for activity signals
 * not captured by session or API key timestamps (e.g. OAuth MCP).
 */
export async function touchUserLastActive(
	db: D1Database,
	userId: string,
	now = new Date(),
): Promise<void> {
	const d1 = drizzle(db, { schema });
	const row = await d1.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { settings: true },
	});
	const current = (row?.settings as UserSettings) ?? {};
	if (!shouldTouchLastActive(current.lastActiveAt, now)) {
		return;
	}

	await d1
		.update(schema.user)
		.set({
			settings: {
				...current,
				lastActiveAt: now.toISOString(),
			},
		})
		.where(eq(schema.user.id, userId));
}
