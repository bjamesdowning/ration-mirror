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

export function isCountUnit(unit?: string): boolean {
	if (!unit) return false;
	return COUNT_UNITS.has(unit.toLowerCase());
}

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
 * Exact scale for Supply aggregation across Manifest occurrences.
 * Preserves fractional count units (e.g. 0.5 head) so weekly sums are correct
 * before {@link roundShoppingCountQuantity} runs once on the total.
 */
export function scaleQuantityExact(
	quantity: number,
	scaleFactor: number,
): number {
	const scaled = quantity * scaleFactor;
	return Math.round(scaled * 100) / 100;
}

/**
 * Whole-item rounding for shopping lists after quantities are summed.
 * Same min-1 semantics as {@link scaleQuantity} for count units.
 */
export function roundShoppingCountQuantity(
	quantity: number,
	unit?: string,
): number {
	if (!isCountUnit(unit)) {
		return Math.round(quantity * 100) / 100;
	}
	if (quantity <= 0) return 0;
	return Math.max(1, Math.round(quantity));
}

/**
 * Count spellings cook may see, including plurals and bulb/loaf.
 * Same mapping as the count aliases in `units.ts`. Continuous units are
 * absent so grams and millilitres keep {@link scaleQuantity}.
 */
const COOK_COUNT_NOUNS: Record<string, string> = {
	unit: "unit",
	units: "unit",
	piece: "piece",
	pieces: "piece",
	dozen: "dozen",
	dozens: "dozen",
	can: "can",
	cans: "can",
	pack: "pack",
	packs: "pack",
	bunch: "bunch",
	bunches: "bunch",
	head: "head",
	heads: "head",
	bulb: "head",
	bulbs: "head",
	loaf: "unit",
	loaves: "unit",
	clove: "clove",
	cloves: "clove",
	slice: "slice",
	slices: "slice",
	stalk: "stalk",
	stalks: "stalk",
	sprig: "sprig",
	sprigs: "sprig",
};

/**
 * Small pieces. Cook may deduct a fraction of these, including after a
 * count bridge (a quarter clove of garlic is a fraction of a bulb).
 */
const COOK_SUB_UNIT_NOUNS = new Set(["clove", "slice", "sprig", "stalk"]);

function cookCountNoun(unit?: string): string | undefined {
	if (!unit) return undefined;
	const key = unit.trim().toLowerCase().replace(/\s+/g, " ");
	return COOK_COUNT_NOUNS[key];
}

/**
 * Serving scale for cook deduction only.
 *
 * Sub-unit nouns keep the exact fraction so repeated cooks add up. Whole
 * count nouns (can, egg `unit` / `piece` / `dozen`, pack, head, bunch, loaf)
 * deduct at least one when the line quantity is above zero, and never deduct
 * zero. Display and cookability keep {@link scaleQuantity}.
 */
export function scaleCookQuantity(
	quantity: number,
	scaleFactor: number,
	unit?: string,
): number {
	const noun = cookCountNoun(unit);
	if (noun && COOK_SUB_UNIT_NOUNS.has(noun)) {
		if (quantity <= 0) return 0;
		return scaleQuantityExact(quantity, scaleFactor);
	}
	if (noun) {
		return scaleQuantity(quantity, scaleFactor, noun);
	}
	return scaleQuantity(quantity, scaleFactor, unit);
}

/**
 * Scales a quantity by the given factor.
 * - Continuous units: rounded to ≤2 decimal places to avoid floating-point noise.
 * - Count units (piece, clove, etc.): rounded to the nearest integer (minimum 1
 *   when the original quantity was > 0).
 *
 * Use for display and cookability. Cook deduction uses {@link scaleCookQuantity}
 * so a fraction of a clove can deduct a fraction. For Supply weekly aggregation,
 * prefer {@link scaleQuantityExact} then {@link roundShoppingCountQuantity}.
 */
export function scaleQuantity(
	quantity: number,
	scaleFactor: number,
	unit?: string,
): number {
	const scaled = quantity * scaleFactor;

	if (isCountUnit(unit)) {
		return Math.max(quantity > 0 ? 1 : 0, Math.round(scaled));
	}

	// Continuous: round to 2 dp to kill float noise
	const rounded = Math.round(scaled * 100) / 100;
	return rounded;
}
