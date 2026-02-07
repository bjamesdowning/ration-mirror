export const INVENTORY_STATUSES = [
	"stable",
	"decay_imminent",
	"biohazard",
] as const;

export const INVENTORY_STATUS_LABELS: Record<string, string> = {
	stable: "STABLE",
	decay_imminent: "DECAY IMMINENT",
	biohazard: "BIOHAZARD",
};

export function formatInventoryStatus(status?: string | null) {
	if (!status) return INVENTORY_STATUS_LABELS.stable;
	return (
		INVENTORY_STATUS_LABELS[status] ?? status.replace(/_/g, " ").toUpperCase()
	);
}

/**
 * Format a tag for display (capitalize first letter)
 */
export function formatTag(tag: string): string {
	return tag.charAt(0).toUpperCase() + tag.slice(1);
}
