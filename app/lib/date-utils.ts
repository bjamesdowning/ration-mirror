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
