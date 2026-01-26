export const INVENTORY_CATEGORIES = [
	"dry_goods",
	"cryo_frozen",
	"perishable",
	"produce",
	"canned",
	"liquid",
	"other",
] as const;

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

export function formatInventoryCategory(category?: string | null) {
	if (!category) return "OTHER";
	return category.replace(/_/g, " ").toUpperCase();
}

export function formatInventoryStatus(status?: string | null) {
	if (!status) return INVENTORY_STATUS_LABELS.stable;
	return (
		INVENTORY_STATUS_LABELS[status] ?? status.replace(/_/g, " ").toUpperCase()
	);
}
