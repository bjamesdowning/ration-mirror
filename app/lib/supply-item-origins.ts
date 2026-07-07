export type SupplyItemOrigin = "manual" | "manifest" | "galley" | "cargo";

export const SUPPLY_ORIGIN_ORDER: SupplyItemOrigin[] = [
	"manifest",
	"galley",
	"cargo",
	"manual",
];

export function mergeSupplyOrigins(
	existing: SupplyItemOrigin[] | undefined,
	incoming: SupplyItemOrigin[],
): SupplyItemOrigin[] {
	const set = new Set<SupplyItemOrigin>([...(existing ?? []), ...incoming]);
	return SUPPLY_ORIGIN_ORDER.filter((o) => set.has(o));
}

export function humanizeSupplyOrigins(origins: SupplyItemOrigin[]): string {
	if (origins.length === 0) return "Added manually";
	const labels: Record<SupplyItemOrigin, string> = {
		manifest: "Manifest",
		galley: "Galley",
		cargo: "Cargo",
		manual: "Manual",
	};
	return origins.map((o) => labels[o]).join(" and ");
}

export function normalizeSupplyOrigins(raw: unknown): SupplyItemOrigin[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(o): o is SupplyItemOrigin =>
			o === "manual" || o === "manifest" || o === "galley" || o === "cargo",
	);
}

export function hasMealSupplyOrigin(raw: unknown): boolean {
	const origins = normalizeSupplyOrigins(raw);
	return origins.some((o) => o === "manifest" || o === "galley");
}

export function hasCargoSupplyOrigin(raw: unknown): boolean {
	return normalizeSupplyOrigins(raw).includes("cargo");
}

type SupplyItemOriginFields = {
	sourceMealId?: string | null;
	sourceCargoId?: string | null;
	sourceMealIds?: string[] | null;
	sourceOrigins?: unknown;
};

/** True when the row is exclusively a user quick-add (not auto-materialized). */
export function isManualOnlySupplyItem(item: SupplyItemOriginFields): boolean {
	if (item.sourceMealId || item.sourceCargoId) return false;
	if (Array.isArray(item.sourceMealIds) && item.sourceMealIds.length > 0) {
		return false;
	}
	const origins = normalizeSupplyOrigins(item.sourceOrigins);
	if (origins.length === 0) return false;
	return (
		origins.includes("manual") &&
		!origins.some((o) => o === "manifest" || o === "galley" || o === "cargo")
	);
}

/** Unpurchased rows removed before unified re-materialization (manual quick-adds kept). */
export function shouldClearUnpurchasedSupplyItemOnSync(item: {
	isPurchased: boolean;
	sourceMealId?: string | null;
	sourceCargoId?: string | null;
	sourceMealIds?: string[] | null;
	sourceOrigins?: unknown;
}): boolean {
	if (item.isPurchased) return false;
	return !isManualOnlySupplyItem(item);
}
