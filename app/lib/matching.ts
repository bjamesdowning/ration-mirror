/**
 * Pure string utilities for ingredient matching.
 * Isomorphic (client + server safe) - no D1, drizzle, or server APIs.
 */

export function normalizeForMatch(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s]/g, "")
		.replace(/\s+/g, " ");
}

/**
 * Regional and dialectal synonym map — maps variant tokens to a canonical token.
 * Applied token-by-token so "tinned tomatoes" → "canned tomatoes" before key generation.
 */
const INGREDIENT_SYNONYMS: Record<string, string> = {
	// Tin/can
	tinned: "canned",
	// British/American produce
	courgette: "zucchini",
	aubergine: "eggplant",
	coriander: "cilantro",
	rocket: "arugula",
	prawns: "shrimp",
	mince: "ground",
	minced: "ground",
	swede: "rutabaga",
	mangetout: "snow peas",
	// Dairy
	single: "light",
	double: "heavy",
	// Flour
	wholemeal: "whole wheat",
	// Misc
	capsicum: "bell pepper",
	spring: "green",
	bicarbonate: "baking",
	bicarb: "baking",
};

/**
 * Prep and packaging words that don't change the identity of an ingredient.
 * Stripped before key generation so "chopped onions" == "onions".
 */
const STRIP_WORDS = new Set([
	"chopped",
	"diced",
	"sliced",
	"crushed",
	"minced",
	"peeled",
	"grated",
	"frozen",
	"fresh",
	"dried",
	"raw",
	"cooked",
	"roasted",
	"toasted",
	"tin",
	"can",
	"jar",
	"packet",
	"bag",
	"bunch",
	"sprig",
	"handful",
	"large",
	"small",
	"medium",
]);

/**
 * Normalizes an ingredient name for deduplication key generation.
 * Stronger than normalizeForMatch: also strips prep/packaging words and
 * substitutes regional synonyms so "tinned tomatoes" and "canned tomatoes"
 * resolve to the same key.
 */
export function normalizeForCargoDedup(name: string): string {
	const base = normalizeForMatch(name);
	const tokens = base.split(" ").flatMap((token) => {
		const synonym = INGREDIENT_SYNONYMS[token];
		return synonym ? synonym.split(" ") : [token];
	});
	const filtered = tokens.filter((t) => t.length > 0 && !STRIP_WORDS.has(t));
	return filtered.join(" ");
}

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "or", "for"]);

export function tokenize(name: string): Set<string> {
	return new Set(
		normalizeForMatch(name)
			.split(" ")
			.filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
	);
}

export function tokenMatchScore(a: string, b: string): number {
	const tokensA = tokenize(a);
	const tokensB = tokenize(b);
	if (tokensA.size === 0 || tokensB.size === 0) return 0;
	let intersection = 0;
	for (const token of tokensA) {
		if (tokensB.has(token)) intersection++;
	}
	const smaller = Math.min(tokensA.size, tokensB.size);
	return intersection / smaller;
}
