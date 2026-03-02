export const CARGO_STATUS_LABELS: Record<string, string> = {
	stable: "STABLE",
	decay_imminent: "DECAY IMMINENT",
	biohazard: "BIOHAZARD",
};

export function formatCargoStatus(status?: string | null) {
	if (!status) return CARGO_STATUS_LABELS.stable;
	return CARGO_STATUS_LABELS[status] ?? status.replace(/_/g, " ").toUpperCase();
}

/**
 * Format a tag for display (capitalize first letter)
 */
export function formatTag(tag: string): string {
	return tag.charAt(0).toUpperCase() + tag.slice(1);
}
