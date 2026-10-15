/**
 * Unit definitions for the public cooking unit converter (/tools/unit-converter).
 *
 * Kept separate from `units.ts` (the app-wide SupportedUnit model used by Cargo,
 * Galley, Supply, MCP and iOS) so that adding regional and informal kitchen
 * units here does not change stored data or in-app conversions.
 */

export type ToolUnitKind = "volume" | "weight";

export interface ToolUnit {
	id: string;
	/** Short symbol shown in results, e.g. "cup (US)". */
	symbol: string;
	/** Longer label for the unit picker. */
	label: string;
	kind: ToolUnitKind;
	/** Millilitres (volume) or grams (weight) in one unit. */
	factor: number;
	group: string;
}

export const TOOL_UNITS: ToolUnit[] = [
	// US customary volume
	{
		id: "tsp",
		symbol: "tsp",
		label: "tsp (teaspoon, US)",
		kind: "volume",
		factor: 4.92892,
		group: "Volume (US)",
	},
	{
		id: "tbsp",
		symbol: "tbsp",
		label: "tbsp (tablespoon, US)",
		kind: "volume",
		factor: 14.7868,
		group: "Volume (US)",
	},
	{
		id: "fl oz",
		symbol: "fl oz (US)",
		label: "fl oz (US fluid ounce, 29.57 ml)",
		kind: "volume",
		factor: 29.5735,
		group: "Volume (US)",
	},
	{
		id: "cup",
		symbol: "cup (US)",
		label: "cup (US, 236.6 ml)",
		kind: "volume",
		factor: 236.588,
		group: "Volume (US)",
	},
	{
		id: "pt",
		symbol: "pt (US)",
		label: "pt (US pint, 473 ml)",
		kind: "volume",
		factor: 473.176,
		group: "Volume (US)",
	},
	{
		id: "qt",
		symbol: "qt (US)",
		label: "qt (US quart)",
		kind: "volume",
		factor: 946.353,
		group: "Volume (US)",
	},
	{
		id: "gal",
		symbol: "gal (US)",
		label: "gal (US gallon)",
		kind: "volume",
		factor: 3785.41,
		group: "Volume (US)",
	},
	{
		id: "pinch",
		symbol: "pinch",
		label: "pinch (1/16 tsp)",
		kind: "volume",
		factor: 4.92892 / 16,
		group: "Volume (US)",
	},
	// UK / metric volume
	{
		id: "cup_metric",
		symbol: "cup (metric)",
		label: "cup (metric, 250 ml — UK, AU, CA, NZ)",
		kind: "volume",
		factor: 250,
		group: "Volume (UK & metric)",
	},
	{
		id: "fl_oz_uk",
		symbol: "fl oz (UK)",
		label: "fl oz (UK imperial fluid ounce, 28.41 ml)",
		kind: "volume",
		factor: 28.4131,
		group: "Volume (UK & metric)",
	},
	{
		id: "pt_uk",
		symbol: "pt (UK)",
		label: "pt (UK imperial pint, 568 ml)",
		kind: "volume",
		factor: 568.261,
		group: "Volume (UK & metric)",
	},
	{
		id: "ml",
		symbol: "ml",
		label: "ml (millilitre)",
		kind: "volume",
		factor: 1,
		group: "Volume (UK & metric)",
	},
	{
		id: "cl",
		symbol: "cl",
		label: "cl (centilitre)",
		kind: "volume",
		factor: 10,
		group: "Volume (UK & metric)",
	},
	{
		id: "l",
		symbol: "l",
		label: "l (litre)",
		kind: "volume",
		factor: 1000,
		group: "Volume (UK & metric)",
	},
	// Weight
	{
		id: "g",
		symbol: "g",
		label: "g (gram)",
		kind: "weight",
		factor: 1,
		group: "Weight",
	},
	{
		id: "kg",
		symbol: "kg",
		label: "kg (kilogram)",
		kind: "weight",
		factor: 1000,
		group: "Weight",
	},
	{
		id: "oz",
		symbol: "oz",
		label: "oz (ounce, weight)",
		kind: "weight",
		factor: 28.3495,
		group: "Weight",
	},
	{
		id: "lb",
		symbol: "lb",
		label: "lb (pound)",
		kind: "weight",
		factor: 453.592,
		group: "Weight",
	},
	{
		id: "stick",
		symbol: "stick",
		label: "stick of butter (US, 113 g)",
		kind: "weight",
		factor: 113,
		group: "Weight",
	},
];

const BY_ID = new Map(TOOL_UNITS.map((u) => [u.id, u]));

export function getToolUnit(id: string): ToolUnit | undefined {
	return BY_ID.get(id);
}

export const TOOL_UNIT_GROUPS: string[] = [
	...new Set(TOOL_UNITS.map((u) => u.group)),
];

/**
 * Converts between tool units. Same-kind conversions ignore density;
 * volume ↔ weight needs a density in g/ml. Returns null when impossible.
 */
export function convertToolUnits(
	quantity: number,
	fromId: string,
	toId: string,
	densityGPerMl?: number | null,
): number | null {
	const from = getToolUnit(fromId);
	const to = getToolUnit(toId);
	if (!from || !to || !Number.isFinite(quantity)) return null;
	const base = quantity * from.factor;
	if (from.kind === to.kind) return base / to.factor;
	if (densityGPerMl == null || !(densityGPerMl > 0)) return null;
	const converted =
		from.kind === "volume" ? base * densityGPerMl : base / densityGPerMl;
	return converted / to.factor;
}

export function isCrossKind(fromId: string, toId: string): boolean {
	const from = getToolUnit(fromId);
	const to = getToolUnit(toId);
	return Boolean(from && to && from.kind !== to.kind);
}
