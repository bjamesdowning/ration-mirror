/**
 * Pure utility functions extracted from cargo.server.ts for testability.
 * These functions have no database or infrastructure dependencies.
 */

import { normalizeForCargoDedup } from "./matching";

/**
 * Extends normalizeForCargoDedup with plural stripping for Phase 1 dedup keys.
 * Strips common English plural suffixes so singular/plural variants share the same key:
 *   "eggs" → "egg", "tomatoes" → "tomato", "potatoes" → "potato", "dishes" → "dish"
 */
export function normalizeForCargoKey(name: string): string {
	const base = normalizeForCargoDedup(name);
	// Order matters: check longer suffixes first
	if (base.endsWith("oes")) return base.slice(0, -2); // tomatoes→tomato, potatoes→potato
	if (base.endsWith("shes")) return base.slice(0, -2); // dishes→dish
	if (base.endsWith("ches")) return base.slice(0, -2); // peaches→peach
	if (base.endsWith("xes")) return base.slice(0, -2); // boxes→box
	if (base.endsWith("zes")) return base.slice(0, -2); // pizzas handled below
	if (base.endsWith("ies")) return `${base.slice(0, -3)}y`; // berries→berry, cherries→cherry
	if (base.endsWith("es") && base.length > 3) return base.slice(0, -1); // grapes→grape
	if (base.endsWith("s") && base.length > 2) return base.slice(0, -1); // eggs→egg, carrots→carrot
	return base;
}

export function normalizeTags(tags: unknown): string[] {
	if (Array.isArray(tags)) {
		return tags.filter((tag) => typeof tag === "string") as string[];
	}
	if (typeof tags === "string") {
		try {
			const parsed = JSON.parse(tags);
			if (Array.isArray(parsed)) {
				return parsed.filter((tag) => typeof tag === "string") as string[];
			}
		} catch {
			return tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean);
		}
	}
	return [];
}

/** UTC calendar date YYYY-MM-DD for a timestamp (expiry dates are stored at UTC midnight). */
export function toExpiryDateISO(expiresAt: Date): string {
	const y = expiresAt.getUTCFullYear();
	const m = String(expiresAt.getUTCMonth() + 1).padStart(2, "0");
	const d = String(expiresAt.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Today as YYYY-MM-DD in UTC. */
export function getUtcTodayISO(now = new Date()): string {
	return toExpiryDateISO(now);
}

export function parseUtcDateISO(iso: string): Date {
	return new Date(`${iso}T00:00:00.000Z`);
}

/** Add calendar days to a UTC YYYY-MM-DD string. */
export function addUtcDays(iso: string, days: number): string {
	const d = parseUtcDateISO(iso);
	d.setUTCDate(d.getUTCDate() + days);
	return toExpiryDateISO(d);
}

/** Signed calendar-day distance from `from` to `to` (both YYYY-MM-DD UTC). */
export function daysBetweenUtcDates(from: string, to: string): number {
	const fromMs = parseUtcDateISO(from).getTime();
	const toMs = parseUtcDateISO(to).getTime();
	return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

/** Calendar days until expiry: 0 = today, negative = expired. */
export function computeDaysUntilExpiry(
	expiresAt: Date,
	now = new Date(),
): number {
	return daysBetweenUtcDates(getUtcTodayISO(now), toExpiryDateISO(expiresAt));
}

/** True when the expiry calendar date is strictly before today (UTC). */
export function isExpiredOnUtcCalendar(
	expiresAt: Date,
	now = new Date(),
): boolean {
	return computeDaysUntilExpiry(expiresAt, now) < 0;
}

/** True when expiry is today or within the next N calendar days (inclusive). */
export function isExpiringWithinDays(
	expiresAt: Date,
	days: number,
	now = new Date(),
): boolean {
	const until = computeDaysUntilExpiry(expiresAt, now);
	return until >= 0 && until <= days;
}

export function startOfUtcDay(now = new Date()): Date {
	return parseUtcDateISO(getUtcTodayISO(now));
}

export type ExpiryDisplayStatus = "expired" | "today" | "soon";

export function expiryDisplayStatus(
	expiresAt: Date,
	now = new Date(),
): ExpiryDisplayStatus {
	const days = computeDaysUntilExpiry(expiresAt, now);
	if (days < 0) return "expired";
	if (days === 0) return "today";
	return "soon";
}

/** SQL bounds for items expiring within N UTC calendar days (includes today). */
export function getExpiringCargoBounds(
	daysUntilExpiry: number,
	now = new Date(),
): { startOfToday: Date; endOfWindow: Date } {
	const today = getUtcTodayISO(now);
	return {
		startOfToday: parseUtcDateISO(today),
		endOfWindow: parseUtcDateISO(addUtcDays(today, daysUntilExpiry)),
	};
}

/** SQL bounds for items expired before today UTC, optionally limited by lookback. */
export function getExpiredCargoBounds(
	daysBack: number,
	now = new Date(),
): { startOfToday: Date; earliest: Date } {
	const today = getUtcTodayISO(now);
	return {
		startOfToday: parseUtcDateISO(today),
		earliest: parseUtcDateISO(addUtcDays(today, -daysBack)),
	};
}

/**
 * Computes the display status for an inventory item based on its expiry date.
 * Uses UTC calendar-day semantics: an item expiring today is still valid today.
 * @param now - Injectable for deterministic testing (defaults to current time)
 */
export function calculateInventoryStatus(
	expiresAt?: Date | null,
	now = new Date(),
): string {
	if (!expiresAt) return "stable";
	const daysUntilExpiry = computeDaysUntilExpiry(expiresAt, now);
	if (daysUntilExpiry < 0) return "biohazard";
	if (daysUntilExpiry < 3) return "decay_imminent";
	return "stable";
}

/** Returns false when cargo is past expiry (biohazard) and must not count toward meal availability. */
export function isCargoUsableForMatching(
	expiresAt?: Date | null,
	now = new Date(),
): boolean {
	return calculateInventoryStatus(expiresAt, now) !== "biohazard";
}
