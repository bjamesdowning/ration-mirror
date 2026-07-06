/**
 * Formats a quantity for display with readable fractions where appropriate.
 */

/** Epsilon for snapping float artifacts (e.g. 1.0000000000243 → 1). */
export const QUANTITY_EPSILON = 1e-6;

const FRACTION_MAP: Record<number, string> = {
	0.25: "¼",
	0.5: "½",
	0.75: "¾",
	0.333: "⅓",
	0.667: "⅔",
	0.125: "⅛",
	0.375: "⅜",
	0.625: "⅝",
	0.875: "⅞",
};

/** Count units that should display as whole numbers when possible */
const COUNT_UNITS = new Set([
	"unit",
	"piece",
	"dozen",
	"can",
	"pack",
	"bunch",
	"clove",
	"slice",
	"head",
	"stalk",
	"sprig",
]);

export function isCountUnit(unit: string): boolean {
	return COUNT_UNITS.has(String(unit).toLowerCase());
}

/** Snaps near-integers caused by floating-point math before display rounding. */
export function snapEpsilon(qty: number): number {
	if (!Number.isFinite(qty)) return qty;
	const rounded = Math.round(qty);
	if (Math.abs(qty - rounded) < QUANTITY_EPSILON) {
		return rounded;
	}
	return qty;
}

const VOLUME_UNIT_ML: Record<string, number> = {
	tsp: 4.92892,
	tbsp: 14.7868,
	cup: 236.588,
};

/**
 * Decomposes awkward volume totals into readable compound units.
 * e.g. 17 tbsp → "1 cup + 1 tbsp"
 */
export function decomposeSubUnits(qty: number, unit: string): string | null {
	const unitLower = String(unit).toLowerCase();
	const qtySnapped = snapEpsilon(qty);

	if (unitLower === "tbsp" && qtySnapped >= 16) {
		const cups = Math.floor(qtySnapped / 16);
		const remainder = snapEpsilon(qtySnapped - cups * 16);
		if (cups > 0 && remainder > 0) {
			return `${formatQuantity(cups, "cup")} + ${formatQuantity(remainder, "tbsp")}`;
		}
	}

	if (unitLower === "tsp" && qtySnapped >= 3) {
		const tbsp = Math.floor(qtySnapped / 3);
		const remainder = snapEpsilon(qtySnapped - tbsp * 3);
		if (tbsp > 0 && remainder > 0) {
			return `${formatQuantity(tbsp, "tbsp")} + ${formatQuantity(remainder, "tsp")}`;
		}
	}

	for (const [largerUnit, mlPerUnit] of Object.entries(VOLUME_UNIT_ML)) {
		if (unitLower !== largerUnit) continue;
		const totalMl = qtySnapped * mlPerUnit;
		const nextLarger =
			largerUnit === "tsp" ? "tbsp" : largerUnit === "tbsp" ? "cup" : null;
		if (!nextLarger) continue;
		const nextMl = VOLUME_UNIT_ML[nextLarger];
		if (!nextMl || totalMl < nextMl) continue;
		const largerQty = Math.floor(totalMl / nextMl);
		const remainderMl = snapEpsilon(totalMl - largerQty * nextMl);
		const remainderQty = remainderMl / mlPerUnit;
		if (largerQty > 0 && remainderQty > 0.01) {
			return `${formatQuantity(largerQty, nextLarger)} + ${formatQuantity(remainderQty, unitLower)}`;
		}
	}

	return null;
}

/**
 * Rounds a quantity for decimal display. Max 2 decimal places; values >= 10 use 1 dp.
 */
export function formatQuantityNumber(
	qty: number,
	unit: string,
	isCount = isCountUnit(unit),
): number {
	const snapped = snapEpsilon(qty);
	if (isCount) {
		return Math.round(snapped);
	}
	const decimals = snapped >= 10 ? 1 : 2;
	return Number.parseFloat(snapped.toFixed(decimals));
}

/**
 * Normalizes a cargo quantity for storage and display (count units → integer;
 * continuous units → max 2 dp, 1 dp when ≥ 10).
 */
export function normalizeCargoQuantity(qty: number, unit: string): number {
	return formatQuantityNumber(qty, unit);
}

/**
 * Formats the numeric portion for display, trimming trailing zeros.
 * e.g. 22.20 → "22.2", 3.00 → "3"
 */
export function formatQuantityNumericString(qty: number, unit: string): string {
	const rounded = formatQuantityNumber(qty, unit);
	if (Number.isInteger(rounded)) {
		return String(rounded);
	}
	return String(rounded);
}

/**
 * Formats a quantity for display. Uses vulgar fractions for common values,
 * otherwise rounds to a sensible number of decimal places (max 2).
 */
export function formatQuantity(qty: number, unit: string): string {
	const unitLower = String(unit).toLowerCase();
	const isCount = isCountUnit(unitLower);
	const qtySnapped = snapEpsilon(qty);

	const decomposed = decomposeSubUnits(qtySnapped, unitLower);
	if (decomposed) {
		return decomposed;
	}

	if (Number.isInteger(qtySnapped) && qtySnapped >= 0 && qtySnapped < 1000) {
		return `${qtySnapped} ${unit}`;
	}

	// Check for close fraction matches
	const frac = qtySnapped % 1;
	if (frac > 0.001 && frac < 0.999) {
		let bestMatch: { diff: number; char: string } | null = null;
		for (const [val, char] of Object.entries(FRACTION_MAP)) {
			const diff = Math.abs(frac - Number.parseFloat(val));
			if (diff < 0.05 && (!bestMatch || diff < bestMatch.diff)) {
				bestMatch = { diff, char };
			}
		}
		if (bestMatch) {
			const whole = Math.floor(qtySnapped);
			const str = whole > 0 ? `${whole}${bestMatch.char}` : bestMatch.char;
			return `${str} ${unit}`;
		}
	}

	const rounded = formatQuantityNumber(qtySnapped, unit, isCount);
	const numeric = formatQuantityNumericString(rounded, unit);

	return `${numeric} ${unit}`;
}
