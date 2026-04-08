/**
 * Normalizes Better Auth / JSON-serialized dates for Intercom `created_at` (Unix seconds).
 */
export function toUnixSeconds(value: unknown): number | undefined {
	if (value == null) return undefined;
	if (typeof value === "number" && Number.isFinite(value)) {
		const sec = value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
		return sec > 0 ? sec : undefined;
	}
	if (value instanceof Date) {
		const sec = Math.floor(value.getTime() / 1000);
		return sec > 0 ? sec : undefined;
	}
	if (typeof value === "string") {
		const t = Date.parse(value);
		if (!Number.isFinite(t)) return undefined;
		const sec = Math.floor(t / 1000);
		return sec > 0 ? sec : undefined;
	}
	return undefined;
}
