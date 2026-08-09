/**
 * Pure FDC description ranking for pantry ingredient names.
 * USDA labels are typically "Head, modifiers…" — score the primary label (before comma).
 */
import { normalizeForMatch, tokenize, tokenMatchScore } from "~/lib/matching";

/** Minimum score to accept a candidate (exact primary "milk" ≈ 500). */
export const FOOD_MATCH_ACCEPT_THRESHOLD = 200;

/** Score at/above this is high-confidence / verified USDA. */
export const FOOD_MATCH_HIGH_CONFIDENCE_THRESHOLD = 450;

/** Tokens that make bare "milk"/"butter"/… mean a different food when in primary label. */
const FRAGILE_EMBED_BLOCKERS = new Set([
	"chocolate",
	"peanut",
	"almond",
	"cashew",
	"coconut",
	"soy",
	"soya",
	"oat",
	"rice",
	"cocoa",
	"cacao",
	"goat",
	"sheep",
	"buffalo",
	"condensed",
	"evaporated",
	"powdered",
	"dry",
	"dessert",
	"candy",
	"candies",
	"snack",
	"snacks",
	"bar",
	"granola",
	"cracker",
	"crackers",
	"imitation",
	"malted",
	"shake",
	"pudding",
	"cereal",
	"coating",
	"chip",
	"chips",
]);

const FRAGILE_QUERY_HEADS = new Set([
	"milk",
	"butter",
	"cream",
	"yogurt",
	"yoghurt",
]);

export type FoodMatchCandidate = {
	fdcId: number;
	description: string;
};

export type RankedFoodMatch = FoodMatchCandidate & {
	score: number;
	highConfidence: boolean;
};

/** Text before the first comma (USDA primary food name). */
export function fdcPrimaryLabel(description: string): string {
	const comma = description.indexOf(",");
	const head = comma >= 0 ? description.slice(0, comma) : description;
	return normalizeForMatch(head);
}

/**
 * Score how well an FDC description matches a normalized pantry query.
 * Higher is better. Returns -Infinity for hard rejects.
 */
export function scoreFoodMatch(
	normalizedQuery: string,
	description: string,
): number {
	const q = normalizeForMatch(normalizedQuery);
	if (!q) return Number.NEGATIVE_INFINITY;

	const descNorm = normalizeForMatch(description);
	const primary = fdcPrimaryLabel(description);
	const qTokens = tokenize(q);
	const primaryTokens = tokenize(primary);

	// Hard reject: single-token fragile head embedded only as a modifier/phrase.
	if (qTokens.size === 1 && FRAGILE_QUERY_HEADS.has(q)) {
		const primaryIsHead = primary === q || primary.startsWith(`${q} `);
		if (!primaryIsHead) {
			return Number.NEGATIVE_INFINITY;
		}
		for (const t of primaryTokens) {
			if (t !== q && FRAGILE_EMBED_BLOCKERS.has(t)) {
				return Number.NEGATIVE_INFINITY;
			}
		}
		// Reject "milk chocolate", "chocolate milk" style when chocolate in primary
		if (descNorm.includes("chocolate") && primary !== q) {
			// "Milk, whole" ok; "Candies, milk chocolate" already rejected (primary !== milk)
		}
	}

	let score = 0;

	if (descNorm === q) {
		score += 1000;
	}
	if (primary === q) {
		score += 500;
	}
	if (primary.startsWith(`${q} `) || primary.startsWith(`${q},`)) {
		score += 400;
	} else if (descNorm.startsWith(`${q} `) || descNorm.startsWith(`${q},`)) {
		score += 350;
	}

	const descTokens = tokenize(descNorm);
	let primaryCoverage = 0;
	for (const t of qTokens) {
		if (primaryTokens.has(t)) primaryCoverage += 1;
	}
	if (qTokens.size > 0 && primaryCoverage === qTokens.size) {
		score += 200;
	}

	let descCoverage = 0;
	for (const t of qTokens) {
		if (descTokens.has(t)) descCoverage += 1;
	}
	if (qTokens.size > 0 && descCoverage === qTokens.size) {
		score += 180;
	}

	score += 50 * tokenMatchScore(q, descNorm);
	score -= Math.min(descNorm.length, 200) / 50;

	return score;
}

/** Pick best candidate above {@link FOOD_MATCH_ACCEPT_THRESHOLD}, or null. */
export function pickBestFoodMatch(
	normalizedQuery: string,
	candidates: FoodMatchCandidate[],
): RankedFoodMatch | null {
	const q = normalizeForMatch(normalizedQuery);
	if (!q || candidates.length === 0) return null;

	let best: RankedFoodMatch | null = null;
	for (const c of candidates) {
		const score = scoreFoodMatch(q, c.description);
		if (score < FOOD_MATCH_ACCEPT_THRESHOLD) continue;
		if (
			!best ||
			score > best.score ||
			(score === best.score && c.description.length < best.description.length)
		) {
			best = {
				...c,
				score,
				highConfidence: score >= FOOD_MATCH_HIGH_CONFIDENCE_THRESHOLD,
			};
		}
	}
	return best;
}
