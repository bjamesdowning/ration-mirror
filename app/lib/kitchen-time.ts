/**
 * Kitchen calendar day. Tenancy: Kitchen.
 * The zone lives on organization.metadata.supplySettings.timeZone.
 * A missing or invalid zone stays on UTC so existing plan and supply
 * dates are not shifted. Stored YYYY-MM-DD values are calendar days;
 * this module only names "today". It does not rewrite those strings.
 */

import type { OrganizationMetadata } from "./types";

function utcTodayISO(now: Date): string {
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	const d = String(now.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

const IANA_TIME_ZONE =
	/^(?:UTC|Etc\/UTC|[A-Za-z]+(?:[_-][A-Za-z0-9]+)*(?:\/[A-Za-z0-9_+-]+)+)$/;

/** True for an IANA name the runtime can format. Offsets and abbreviations are rejected. */
export function isValidIanaTimeZone(value: string): boolean {
	if (!IANA_TIME_ZONE.test(value) || value.length > 64) return false;
	try {
		Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** Validated kitchen zone, or null when the kitchen has not captured one. */
export function resolveKitchenTimeZone(
	metadata: OrganizationMetadata | null | undefined,
): string | null {
	const raw = metadata?.supplySettings?.timeZone;
	if (typeof raw !== "string") return null;
	const timeZone = raw.trim();
	return isValidIanaTimeZone(timeZone) ? timeZone : null;
}

/** YYYY-MM-DD for `now` in an IANA zone. Does not interpret a stored date string. */
export function formatISODateInTimeZone(now: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);
	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;
	if (!year || !month || !day) return utcTodayISO(now);
	return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Calendar today for Manifest, Supply, and kitchen-scoped defaults.
 * Missing zone matches the previous Worker behavior: UTC.
 */
export function kitchenTodayISO(
	metadata: OrganizationMetadata | null | undefined,
	now = new Date(),
): string {
	const timeZone = resolveKitchenTimeZone(metadata);
	if (!timeZone) return utcTodayISO(now);
	return formatISODateInTimeZone(now, timeZone);
}
