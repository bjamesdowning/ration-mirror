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

/**
 * Formats a quantity for display. Uses vulgar fractions for common values,
 * otherwise rounds to a sensible number of decimal places.
 */
export function formatQuantity(qty: number, unit: string): string {
	const unitLower = String(unit).toLowerCase();
	const isCount = COUNT_UNITS.has(unitLower);

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

	// Round to 1-2 decimals for non-count, 0 for count
	const decimals = isCount ? 0 : qty >= 10 ? 1 : 2;
	const rounded =
		decimals === 0 ? Math.round(qty) : Number.parseFloat(qty.toFixed(decimals));

	return `${rounded} ${unit}`;
}
