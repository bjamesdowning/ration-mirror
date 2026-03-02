/**
 * Pure display utilities for human-readable formatting.
 * Isomorphic (client + server safe).
 */

/**
 * Converts lowercase normalized strings to title case for display.
 * e.g. "olive oil" -> "Olive Oil"
 */
export function toTitleCase(s: string): string {
	return s
		.split(" ")
		.map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : ""))
		.join(" ");
}

/**
 * Formats time remaining until snooze expiry for display.
 * Returns relative phrases: "2 days left", "6h left", "Expires soon" (< 1h), "Expired"
 */
export function formatSnoozeTimeLeft(
	snoozedUntil: Date,
	now = new Date(),
): string {
	const ms = snoozedUntil.getTime() - now.getTime();

	if (ms <= 0) return "Expired";

	const hours = Math.floor(ms / (60 * 60 * 1000));
	const days = Math.floor(hours / 24);

	if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
	if (hours >= 1) return `${hours}h left`;
	return "Expires soon";
}
