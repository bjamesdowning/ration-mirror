/**
 * Pure FDC description ranking for pantry ingredient names.
 * USDA labels are typically "Head, modifiers…" — score primary + inverted OCR phrases.
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

/** Auto-attach gate (plan): margin vs runner-up (non-peer). */
export const FOOD_MATCH_AUTO_ACCEPT_MARGIN = 0.12;

/** Tokens that make bare "milk"/"butter"/… mean a different food when in primary or modifiers. */
export const FRAGILE_EMBED_BLOCKERS = new Set([
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

export const FRAGILE_QUERY_HEADS = new Set([
	"milk",
	"butter",
	"cream",
	"yogurt",
	"yoghurt",
]);

/**
 * Fragile commodity head for primary-prefix retrieve (e.g. milk → Milk,%).
 * Uses any fragile token in the query ("whole milk" → milk).
 */
export function fragileHeadForPrimaryPrefix(
	normalizedQuery: string,
): string | null {
	const q = normalizeForMatch(normalizedQuery);
	if (!q) return null;
	const tokens = q.split(/\s+/).filter(Boolean);
	for (const t of tokens) {
		if (FRAGILE_QUERY_HEADS.has(t)) return t;
	}
	return null;
}

/** Title-case USDA primary LIKE pattern(s) for a fragile head. */
export function primaryPrefixLikePatterns(fragileHead: string): string[] {
	const head = fragileHead.toLowerCase();
	if (head === "yoghurt" || head === "yogurt") {
		return ["Yogurt,%", "Yoghurt,%"];
	}
	const titled = head.charAt(0).toUpperCase() + head.slice(1);
	return [`${titled},%`];
}

/** Dedupe candidate banks by fdcId (FTS first, then prefix bank). */
export function mergeFoodMatchCandidates(
	primary: FoodMatchCandidate[],
	extra: FoodMatchCandidate[],
): FoodMatchCandidate[] {
	const byId = new Map<number, FoodMatchCandidate>();
	for (const c of primary) byId.set(c.fdcId, c);
	for (const c of extra) {
		if (!byId.has(c.fdcId)) byId.set(c.fdcId, c);
	}
	return [...byId.values()];
}

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

/**
 * Distinguishing modifiers used for peer-dedupe (same food, different FDC rows).
 * Near-duplicate Foundation vs SR Legacy rows share primary + these tokens.
 */
const PEER_MODIFIER_TOKENS = new Set([
	"whole",
	"skim",
	"nonfat",
	"fatfree",
	"lowfat",
	"reduced",
	"light",
	"lite",
	"2",
	"1",
	"salted",
	"unsalted",
	"raw",
	"cooked",
	"roasted",
	"fried",
	"breast",
	"thigh",
	"drumstick",
	"ground",
	"almond",
	"oat",
	"soy",
	"soya",
	"coconut",
	"rice",
	"goat",
	"sheep",
	"chocolate",
	"peanut",
	"sweetened",
	"unsweetened",
	"condensed",
	"evaporated",
	"powdered",
	"dry",
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

/** Modifier segment after the first comma (normalized). */
export function fdcModifierSegment(description: string): string {
	const comma = description.indexOf(",");
	if (comma < 0) return "";
	return normalizeForMatch(description.slice(comma + 1));
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
 * Peer key so Foundation vs SR Legacy duplicates do not collapse auto-accept margin.
 */
export function foodMatchPeerKey(description: string): string {
	const primary = fdcPrimaryLabel(description);
	const descTokens = tokenize(normalizeForMatch(description));
	const mods = new Set<string>();
	for (const t of descTokens) {
		if (PEER_MODIFIER_TOKENS.has(t)) mods.add(t);
	}
	return `${primary}|${[...mods].sort().join(",")}`;
}

/**
 * Prefer the last query token as the commodity head ("whole milk" → milk),
 * falling back to any token that matches the FDC primary label.
 */
function resolveQueryHead(
	qTokens: Set<string>,
	primary: string,
): string | null {
	const ordered = [...qTokens];
	const last = ordered[ordered.length - 1];
	if (
		last &&
		(tokensRoughlyEqual(last, primary) || tokenSetHas(tokenize(primary), last))
	) {
		return last;
	}
	for (const t of qTokens) {
		if (tokensRoughlyEqual(t, primary) || tokenSetHas(tokenize(primary), t)) {
			return t;
		}
	}
	return null;
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
	const modifiers = fdcModifierSegment(description);
	const qTokens = tokenize(q);
	const primaryTokens = tokenize(primary);
	const modifierTokens = tokenize(modifiers);
	const descTokens = tokenize(descNorm);

	// Hard reject: single-token fragile head embedded only as a modifier/phrase,
	// or dairy primary with blocked style modifiers (imitation, dry, chocolate…).
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
		for (const t of modifierTokens) {
			if (FRAGILE_EMBED_BLOCKERS.has(t)) {
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

	// Strong identity: single-token query matches primary (incl. plurals).
	if (
		qTokens.size === 1 &&
		(tokensRoughlyEqual(primary, q) ||
			tokenSetHas(primaryTokens, q) ||
			primary.startsWith(`${q} `))
	) {
		score += 450;
	}

	// Inverted USDA labels: OCR "whole milk" ↔ "Milk, whole, …"
	const head = resolveQueryHead(qTokens, primary);
	if (head && qTokens.size >= 2) {
		const primaryIsHead =
			tokensRoughlyEqual(primary, head) ||
			tokenSetHas(primaryTokens, head) ||
			primary.startsWith(`${head} `);
		if (primaryIsHead) {
			const remaining: string[] = [];
			for (const t of qTokens) {
				if (!tokensRoughlyEqual(t, head)) remaining.push(t);
			}
			let modHits = 0;
			for (const t of remaining) {
				if (
					tokenSetHas(modifierTokens, t) ||
					tokenSetHas(descTokens, t) ||
					tokenSetHas(primaryTokens, t)
				) {
					modHits += 1;
				}
			}
			if (remaining.length === 0) {
				score += 450;
			} else if (modHits === remaining.length) {
				// Full inverted match: "whole milk" ↔ "Milk, whole, …"
				score += 450 + 500;
			} else if (modHits > 0) {
				score += 450 + Math.round(200 * (modHits / remaining.length));
			} else {
				// Multi-token query with only primary overlap ("chef special sauce")
				// — keep below accept unless other strong signals fire.
				score += 80;
			}
		} else if (CATEGORY_PRIMARY_LABELS.has(primary)) {
			// Category primaries keep the food name in modifiers ("Oil, olive…").
			let catHits = 0;
			for (const t of qTokens) {
				if (tokenSetHas(modifierTokens, t) || tokenSetHas(descTokens, t)) {
					catHits += 1;
				}
			}
			if (catHits === qTokens.size) {
				score += 700;
			} else if (catHits > 0) {
				score += Math.round(250 * (catHits / qTokens.size));
			}
		}
	}

	let primaryCoverage = 0;
	for (const t of qTokens) {
		if (tokenSetHas(primaryTokens, t)) primaryCoverage += 1;
	}
	if (qTokens.size > 0 && primaryCoverage === qTokens.size) {
		score += 200;
	}

	let descCoverage = 0;
	for (const t of qTokens) {
		if (tokenSetHas(descTokens, t)) descCoverage += 1;
	}
	if (qTokens.size > 0 && descCoverage === qTokens.size) {
		score += 180;
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
 * Auto-attach requires score ≥ 0.92 and margin ≥ 0.12 vs a non-peer runner-up.
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
		// Length penalty creates sub-point noise; treat near-ties as equal so
		// Foundation preference and stable fdcId order can decide.
		if (Math.abs(b.score - a.score) >= 1) return b.score - a.score;
		const aFoundation = isFoundationDataType(a.dataType) ? 0 : 1;
		const bFoundation = isFoundationDataType(b.dataType) ? 0 : 1;
		if (aFoundation !== bFoundation) return aFoundation - bFoundation;
		return (a.fdcId ?? 0) - (b.fdcId ?? 0);
	});

	const best = ranked[0];
	const bestPeer = foodMatchPeerKey(best.description);
	const second = ranked.find(
		(c) =>
			c.fdcId !== best.fdcId && foodMatchPeerKey(c.description) !== bestPeer,
	);
	const normalizedScore = normalizeFoodMatchScore(best.score);
	// Peer-deduped margin: near-tie semantic siblings (e.g. whole vs lowfat for
	// bare "milk") should not block attach when Foundation already won ranking.
	const secondNorm = second ? normalizeFoodMatchScore(second.score) : 0;
	const rawMargin = normalizedScore - secondNorm;
	const margin =
		second && Math.abs(best.score - second.score) < 1
			? FOOD_MATCH_AUTO_ACCEPT_MARGIN
			: rawMargin;
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
