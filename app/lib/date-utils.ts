/**
 * Normalize value from DB to Date. D1/Drizzle may return raw Unix seconds.
 * Values < 1e12 are Unix seconds; >= 1e12 are milliseconds.
 */
export function toExpiryDate(
	val: Date | number | string | null | undefined,
): Date | null {
	if (val == null) return null;
	if (val instanceof Date) return val;
	const n = typeof val === "number" ? val : Number.parseInt(String(val), 10);
	if (Number.isNaN(n)) return null;
	return new Date(n > 1e12 ? n : n * 1000);
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Parse dock/scan expiry from UI (`yyyy-MM-DD`), ISO datetime, or legacy unix.
 * Do not use {@link toExpiryDate} alone for calendar strings — `parseInt("2026-07-17")`
 * wrongly yields year 2026 → epoch.
 */
export function parseDockExpiresAt(
	val: Date | number | string | null | undefined,
): Date | null {
	if (val == null) return null;
	if (val instanceof Date) {
		return Number.isNaN(val.getTime()) ? null : val;
	}
	if (typeof val === "number") {
		return toExpiryDate(val);
	}
	const trimmed = val.trim();
	if (!trimmed) return null;
	if (CALENDAR_DATE.test(trimmed)) {
		const d = new Date(`${trimmed}T00:00:00.000Z`);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	if (ISO_DATETIME.test(trimmed)) {
		const d = new Date(trimmed);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return toExpiryDate(trimmed);
}
