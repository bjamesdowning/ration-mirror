/**
 * Pure FDC description ranking for pantry ingredient names.
 * USDA labels are typically "Head, modifiers…" — score the primary label (before comma).
 */
import { normalizeForMatch, tokenize, tokenMatchScore } from "~/lib/matching";

/** Minimum raw score to keep a candidate for ranking. */
export const FOOD_MATCH_ACCEPT_THRESHOLD = 200;

/** Legacy high-confidence raw score (maps to quality "high", not verified). */
export const FOOD_MATCH_HIGH_CONFIDENCE_THRESHOLD = 450;

/** Reference for normalizing raw scores into 0–1. */
export const FOOD_MATCH_SCORE_REFERENCE = 1000;

/** Auto-attach gate (plan): normalized score. */
export const FOOD_MATCH_AUTO_ACCEPT_SCORE = 0.92;

/** Auto-attach gate (plan): margin vs runner-up. */
export const FOOD_MATCH_AUTO_ACCEPT_MARGIN = 0.12;

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

/** USDA often uses a category primary ("Nuts", "Fish") with the food in modifiers. */
const CATEGORY_PRIMARY_LABELS = new Set([
	"nuts",
	"fish",
	"oil",
	"oils",
	"spices",
	"seeds",
	"cheese",
	"cereals",
	"snacks",
	"beverages",
	"soup",
	"soups",
	"crustaceans",
	"mollusks",
	"game meat",
	"alcoholic beverage",
]);

export type FoodMatchCandidate = {
	fdcId: number;
	description: string;
	dataType?: string;
};

export type RankedFoodMatch = FoodMatchCandidate & {
	score: number;
	normalizedScore: number;
	margin: number;
	/** Automated match quality — never "verified" (reserved for user/barcode). */
	quality: "high" | "medium" | "low";
	/** True when auto-attach gates pass. */
	autoAccept: boolean;
	/** @deprecated Prefer quality === "high"; kept for callers. */
	highConfidence: boolean;
};

/** Text before the first comma (USDA primary food name). */
export function fdcPrimaryLabel(description: string): string {
	const comma = description.indexOf(",");
	const head = comma >= 0 ? description.slice(0, comma) : description;
	return normalizeForMatch(head);
}

/** Light English plural / singular equivalence for pantry ↔ USDA labels. */
export function tokensRoughlyEqual(a: string, b: string): boolean {
	if (a === b) return true;
	if (a.length < 3 || b.length < 3) return false;
	if (a + "s" === b || b + "s" === a) return true;
	if (a + "es" === b || b + "es" === a) return true;
	if (a.endsWith("y") && `${a.slice(0, -1)}ies` === b) return true;
	if (b.endsWith("y") && `${b.slice(0, -1)}ies` === a) return true;
	return false;
}

function tokenSetHas(tokens: Set<string>, needle: string): boolean {
	if (tokens.has(needle)) return true;
	for (const t of tokens) {
		if (tokensRoughlyEqual(t, needle)) return true;
	}
	return false;
}

export function normalizeFoodMatchScore(rawScore: number): number {
	if (!Number.isFinite(rawScore) || rawScore <= 0) return 0;
	return Math.min(1, rawScore / FOOD_MATCH_SCORE_REFERENCE);
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
		const primaryIsHead =
			tokensRoughlyEqual(primary, q) || primary.startsWith(`${q} `);
		if (!primaryIsHead) {
			return Number.NEGATIVE_INFINITY;
		}
		for (const t of primaryTokens) {
			if (!tokensRoughlyEqual(t, q) && FRAGILE_EMBED_BLOCKERS.has(t)) {
				return Number.NEGATIVE_INFINITY;
			}
		}
	}

	let score = 0;

	if (descNorm === q || tokensRoughlyEqual(descNorm, q)) {
		score += 1000;
	}
	if (primary === q || tokensRoughlyEqual(primary, q)) {
		score += 500;
	}
	if (primary.startsWith(`${q} `) || primary.startsWith(`${q},`)) {
		score += 400;
	} else if (descNorm.startsWith(`${q} `) || descNorm.startsWith(`${q},`)) {
		score += 350;
	}

	let primaryCoverage = 0;
	for (const t of qTokens) {
		if (tokenSetHas(primaryTokens, t)) primaryCoverage += 1;
	}
	if (qTokens.size > 0 && primaryCoverage === qTokens.size) {
		score += 200;
	}

	const descTokens = tokenize(descNorm);
	let descCoverage = 0;
	for (const t of qTokens) {
		if (tokenSetHas(descTokens, t)) descCoverage += 1;
	}
	if (qTokens.size > 0 && descCoverage === qTokens.size) {
		score += 180;
		// Category primaries (Nuts, Fish, …) keep the real food name in modifiers.
		if (CATEGORY_PRIMARY_LABELS.has(primary)) {
			score += 250;
		}
	}

	score += 50 * tokenMatchScore(q, descNorm);
	score -= Math.min(descNorm.length, 200) / 50;

	return score;
}

function qualityFromNormalized(
	normalizedScore: number,
): "high" | "medium" | "low" {
	if (normalizedScore >= FOOD_MATCH_AUTO_ACCEPT_SCORE) return "high";
	if (normalizedScore >= 0.45) return "medium";
	return "low";
}

/**
 * Pick best candidate above {@link FOOD_MATCH_ACCEPT_THRESHOLD}, or null.
 * Auto-attach requires score ≥ 0.92 and margin ≥ 0.12 with no hard conflict.
 */
export function pickBestFoodMatch(
	normalizedQuery: string,
	candidates: FoodMatchCandidate[],
): RankedFoodMatch | null {
	const q = normalizeForMatch(normalizedQuery);
	if (!q || candidates.length === 0) return null;

	const ranked: Array<FoodMatchCandidate & { score: number }> = [];
	for (const c of candidates) {
		const score = scoreFoodMatch(q, c.description);
		if (score < FOOD_MATCH_ACCEPT_THRESHOLD) continue;
		ranked.push({ ...c, score });
	}
	if (ranked.length === 0) return null;

	ranked.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		const aFoundation = isFoundationDataType(a.dataType) ? 0 : 1;
		const bFoundation = isFoundationDataType(b.dataType) ? 0 : 1;
		if (aFoundation !== bFoundation) return aFoundation - bFoundation;
		return (a.fdcId ?? 0) - (b.fdcId ?? 0);
	});

	const best = ranked[0];
	const second = ranked[1];
	const normalizedScore = normalizeFoodMatchScore(best.score);
	const secondNorm = second ? normalizeFoodMatchScore(second.score) : 0;
	const margin = normalizedScore - secondNorm;
	const quality = qualityFromNormalized(normalizedScore);
	const autoAccept =
		normalizedScore >= FOOD_MATCH_AUTO_ACCEPT_SCORE &&
		margin >= FOOD_MATCH_AUTO_ACCEPT_MARGIN;

	return {
		...best,
		normalizedScore,
		margin,
		// Auto-attach only; score≥0.92 without margin demotes off "high".
		quality: autoAccept ? "high" : quality === "high" ? "medium" : quality,
		autoAccept,
		/** @deprecated Alias of autoAccept — never means verified. */
		highConfidence: autoAccept,
	};
}

function isFoundationDataType(dataType: string | undefined): boolean {
	return dataType === "foundation_food" || dataType === "foundation";
}
