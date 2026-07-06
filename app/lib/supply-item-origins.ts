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
