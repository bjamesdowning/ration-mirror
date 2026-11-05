/**
 * Kitchen tenancy for a Manifest entry.
 * `cooked` means the household prepared the meal (`cookedAt`, or legacy
 * `consumedAt` from the cook dual-write). It is not a personal diary row.
 */
export type ManifestKitchenStatus = "planned" | "cooked";

export function manifestKitchenStatus(
	cookedAt: unknown,
	consumedAt: unknown,
): ManifestKitchenStatus {
	return cookedAt != null || consumedAt != null ? "cooked" : "planned";
}

/** ISO-8601 for agent JSON. Date objects would otherwise collapse to `{}`. */
export function manifestTimestampIso(
	value: Date | string | number | null | undefined,
): string | null {
	if (value == null) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "number") return new Date(value).toISOString();
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
