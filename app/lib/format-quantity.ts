/**
 * Formats a quantity for display with readable fractions where appropriate.
 */

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

function isCountUnit(unit: string): boolean {
	return COUNT_UNITS.has(String(unit).toLowerCase());
}

/**
 * Rounds a quantity for decimal display. Max 2 decimal places; values >= 10 use 1 dp.
 */
export function formatQuantityNumber(
	qty: number,
	unit: string,
	isCount = isCountUnit(unit),
): number {
	if (isCount) {
		return Math.round(qty);
	}
	const decimals = qty >= 10 ? 1 : 2;
	return Number.parseFloat(qty.toFixed(decimals));
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

	if (Number.isInteger(qty) && qty >= 0 && qty < 1000) {
		return `${qty} ${unit}`;
	}

	// Check for close fraction matches
	const frac = qty % 1;
	if (frac > 0.001 && frac < 0.999) {
		let bestMatch: { diff: number; char: string } | null = null;
		for (const [val, char] of Object.entries(FRACTION_MAP)) {
			const diff = Math.abs(frac - Number.parseFloat(val));
			if (diff < 0.05 && (!bestMatch || diff < bestMatch.diff)) {
				bestMatch = { diff, char };
			}
		}
		if (bestMatch) {
			const whole = Math.floor(qty);
			const str = whole > 0 ? `${whole}${bestMatch.char}` : bestMatch.char;
			return `${str} ${unit}`;
		}
	}

	const rounded = formatQuantityNumber(qty, unit, isCount);
	const numeric = formatQuantityNumericString(rounded, unit);

	return `${numeric} ${unit}`;
}
