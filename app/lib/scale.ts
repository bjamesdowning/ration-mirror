/**
 * Recipe scaling utilities (shared client/server).
 *
 * All ingredient quantities in the database are stored at base servings
 * (meal.servings). To cook for a different number, multiply by the scale
 * factor returned here before deducting from cargo or displaying to the user.
 */

/** Count-based units that must be deducted as whole numbers */
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
 * Returns the multiplier needed to go from base servings to desired servings.
 * E.g. base=4, desired=2 → 0.5; base=4, desired=8 → 2.
 */
export function getScaleFactor(
	mealServings: number,
	desiredServings: number,
): number {
	if (mealServings <= 0) return 1;
	return desiredServings / mealServings;
}

/**
 * Scales a quantity by the given factor.
 * - Continuous units: rounded to ≤2 decimal places to avoid floating-point noise.
 * - Count units (piece, clove, etc.): rounded to the nearest integer (minimum 1
 *   when the original quantity was > 0).
 */
export function scaleQuantity(
	quantity: number,
	scaleFactor: number,
	unit?: string,
): number {
	const scaled = quantity * scaleFactor;
	const isCount = unit ? COUNT_UNITS.has(unit.toLowerCase()) : false;

	if (isCount) {
		return Math.max(quantity > 0 ? 1 : 0, Math.round(scaled));
	}

	// Continuous: round to 2 dp to kill float noise
	const rounded = Math.round(scaled * 100) / 100;
	return rounded;
}
