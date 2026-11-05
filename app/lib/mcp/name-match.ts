/**
 * Name resolution for pantry search vs stock writes.
 *
 * Search keeps a wide recall floor and reports whether cook would accept the
 * hit. adjust_cargo_item and quick_eat_cargo may apply a name only on an exact
 * match or a semantic hit at or above the cook threshold. A weaker hit is
 * returned for the caller to confirm.
 */

import { SIMILARITY_THRESHOLDS } from "../vector.server";

/** Recall floor for search_ingredients and for collecting write-path candidates. */
export const NAME_SEARCH_RECALL_THRESHOLD = 0.6;

/** Cook, deduction, and stock-write floor. Same value as INGREDIENT_MATCH. */
export const STOCK_NAME_MATCH_THRESHOLD =
	SIMILARITY_THRESHOLDS.INGREDIENT_MATCH;

export type ScoredNameMatch = {
	itemId: string;
	score: number;
};

export type NameMatchDisambiguationReason =
	| "below_cook_threshold"
	| "close_scores";

export type NameMatchDecision =
	| { kind: "none" }
	| { kind: "use"; itemId: string }
	| {
			kind: "disambiguate";
			reason: NameMatchDisambiguationReason;
			matches: ScoredNameMatch[];
	  };

/**
 * Auto-pick only a clear top hit at or above the cook threshold.
 * Anything weaker, or a runner-up inside `scoreGap`, must be confirmed.
 */
export function decideStockNameMatch(
	matches: readonly ScoredNameMatch[],
	scoreGap: number,
): NameMatchDecision {
	const ranked = matches
		.filter((match) => match.itemId.length > 0 && Number.isFinite(match.score))
		.slice()
		.sort((a, b) => b.score - a.score);
	const top = ranked[0];
	if (!top) return { kind: "none" };
	const runnerUp = ranked[1];
	if (top.score < STOCK_NAME_MATCH_THRESHOLD) {
		return {
			kind: "disambiguate",
			reason: "below_cook_threshold",
			matches: ranked,
		};
	}
	if (runnerUp != null && top.score - runnerUp.score < scoreGap) {
		return { kind: "disambiguate", reason: "close_scores", matches: ranked };
	}
	return { kind: "use", itemId: top.itemId };
}

export function cookMatchForScore(score: number): boolean {
	return score >= STOCK_NAME_MATCH_THRESHOLD;
}

export function stockNameDisambiguationNote(
	query: string,
	reason: NameMatchDisambiguationReason,
	retry: string,
): string {
	if (reason === "below_cook_threshold") {
		return `No pantry match for "${query}" is strong enough to change stock (cook threshold ${STOCK_NAME_MATCH_THRESHOLD}). Ask which candidate, then ${retry}. Nothing was changed.`;
	}
	return `Multiple pantry items matched "${query}". Ask which one, then ${retry}.`;
}
