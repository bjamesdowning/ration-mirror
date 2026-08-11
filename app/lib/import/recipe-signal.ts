/**
 * Heuristic recipe-signal score for social captions/descriptions.
 * Used to skip paid Supadata transcript when the caption already looks like a recipe.
 */

const UNIT_PATTERN =
	/\b(\d+[.,]?\d*)\s*(g|kg|ml|l|oz|lb|tbsp|tsp|cup|cups|tablespoon|teaspoon|clove|cloves)\b/i;
const INGREDIENT_LINE = /^[\s•\-–*]*(?:\d+[./\d]*)?\s*[a-z].{2,60}$/im;
const STEP_CUES =
	/\b(preheat|mix|stir|bake|cook|simmer|boil|chop|slice|add|heat|whisk|fold|serve|minutes?|until)\b/i;

export function scoreRecipeSignal(text: string): number {
	const trimmed = text.trim();
	if (trimmed.length < 40) return 0;

	let score = 0;
	if (trimmed.length >= 120) score += 1;
	if (trimmed.length >= 280) score += 1;

	const unitHits = trimmed.match(new RegExp(UNIT_PATTERN.source, "gi"));
	if (unitHits && unitHits.length >= 2) score += 2;
	else if (unitHits && unitHits.length >= 1) score += 1;

	const lines = trimmed.split(/\n+/).filter((l) => l.trim().length > 0);
	const ingredientish = lines.filter((l) => INGREDIENT_LINE.test(l.trim()));
	if (ingredientish.length >= 3) score += 2;
	else if (ingredientish.length >= 1) score += 1;

	if (STEP_CUES.test(trimmed)) score += 1;

	const numberedSteps = lines.filter((l) => /^\s*\d+[).:]/.test(l));
	if (numberedSteps.length >= 2) score += 2;

	return score;
}

/** True when caption/description is rich enough to skip transcript fetch. */
export function hasStrongRecipeSignal(text: string): boolean {
	return scoreRecipeSignal(text) >= 4;
}
