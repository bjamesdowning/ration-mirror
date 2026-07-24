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

/**
 * Last content token of a normalized name — culinary "head noun"
 * (e.g. "olive oil" → "oil", "basmati rice" → "rice").
 */
export function headNoun(normalizedName: string): string {
	const parts = normalizedName
		.trim()
		.split(/\s+/)
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
	return parts.length > 0 ? parts[parts.length - 1] : "";
}

/** First content token (e.g. "chicken breast" → "chicken"). */
export function leadingToken(normalizedName: string): string {
	const parts = normalizedName
		.trim()
		.split(/\s+/)
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
	return parts.length > 0 ? parts[0] : "";
}

/** Ultra-generic heads that must not auto-expand via token phase (vector/exact only). */
const ULTRA_GENERIC_HEADS = new Set([
	"sauce",
	"spice",
	"seasoning",
	"mix",
	"paste",
	"extract",
	"juice",
]);

/**
 * When a single-token recipe matches as the *leading* token of cargo
 * (chicken → chicken breast), reject if cargo's head noun transforms meaning
 * (rice → rice vinegar).
 */
const TRANSFORMING_HEADS = new Set([
	"vinegar",
	"sauce",
	"paste",
	"juice",
	"extract",
	"oil",
	"water",
	"broth",
	"stock",
	"wine",
	"beer",
	"soup",
	"seasoning",
	"spice",
	"mix",
	"powder",
	"syrup",
	"relish",
	"chutney",
	"dressing",
	"butter", // chicken butter N/A; peanut path handled elsewhere
	"milk",
	"cream",
]);

/** Heads where plant/animal modifiers create a different food, not a specialization. */
const FRAGILE_HEADS = new Set(["butter", "milk", "cream", "yogurt", "yoghurt"]);

/**
 * Extra tokens that transform fragile heads (butter/milk/…) into a different food.
 * Not applied to oil/salt/rice/chicken-style heads.
 */
const FRAGILE_BLOCKING_MODIFIERS = new Set([
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
	"sunflower",
	"seed",
	"nut",
	"hazelnut",
	"walnut",
	"pistachio",
	"macadamia",
	"goat",
	"sheep",
	"buffalo",
	"condensed",
	"evaporated",
	"powdered",
]);

/** Extra tokens that make "pepper" mean a chile/vegetable, not black pepper. */
const PEPPER_VEGETABLE_MODIFIERS = new Set([
	"bell",
	"chili",
	"chilli",
	"chile",
	"sweet",
	"hot",
	"cayenne",
]);

function tokensOfNormalized(normalizedName: string): Set<string> {
	return new Set(
		normalizedName
			.split(/\s+/)
			.filter((t) => t.length > 1 && !STOP_WORDS.has(t)),
	);
}

function isSubset(smaller: Set<string>, larger: Set<string>): boolean {
	if (smaller.size === 0) return false;
	for (const t of smaller) {
		if (!larger.has(t)) return false;
	}
	return true;
}

/**
 * True when both names share a head noun and one token-set is a subset of the
 * other (generic ↔ specialization), e.g. oil ⊆ olive oil, olive oil ⊆ EVOO.
 */
export function isBidirectionalHeadNounSubset(a: string, b: string): boolean {
	const normA = normalizeForCargoDedup(a);
	const normB = normalizeForCargoDedup(b);
	if (!normA || !normB) return false;
	const headA = headNoun(normA);
	const headB = headNoun(normB);
	if (!headA || headA !== headB) return false;
	const tokensA = tokensOfNormalized(normA);
	const tokensB = tokensOfNormalized(normB);
	return isSubset(tokensA, tokensB) || isSubset(tokensB, tokensA);
}

/**
 * Single-token recipe as leading token of a longer cargo name
 * (chicken → chicken breast), excluding transforming heads (rice ↛ rice vinegar).
 */
function isLeadingTokenSpecialization(
	recipeNorm: string,
	cargoNorm: string,
): boolean {
	const recipeTokens = tokensOfNormalized(recipeNorm);
	const cargoTokens = tokensOfNormalized(cargoNorm);
	if (recipeTokens.size !== 1 || cargoTokens.size < 2) return false;
	const sole = [...recipeTokens][0];
	if (leadingToken(cargoNorm) !== sole) return false;
	if (!isSubset(recipeTokens, cargoTokens)) return false;
	const cargoHead = headNoun(cargoNorm);
	if (TRANSFORMING_HEADS.has(cargoHead)) return false;
	return true;
}

/**
 * Rejects compound foods that share a head noun but are not culinary
 * specializations of a short generic (butter ↛ peanut butter, milk ↛ coconut milk).
 * Ultra-generic heads (sauce, juice, …) never pass token expansion.
 */
export function passesCompoundGuard(
	recipeNorm: string,
	cargoNorm: string,
): boolean {
	const recipeTokens = tokensOfNormalized(recipeNorm);
	const cargoTokens = tokensOfNormalized(cargoNorm);
	if (recipeTokens.size === 0 || cargoTokens.size === 0) return false;

	const recipeHead = headNoun(recipeNorm);
	if (ULTRA_GENERIC_HEADS.has(recipeHead)) return false;

	const [shorter, longer] =
		recipeTokens.size <= cargoTokens.size
			? [recipeTokens, cargoTokens]
			: [cargoTokens, recipeTokens];

	// Both sides reasonably specific — subset + shared head is enough
	if (shorter.size > 2) return true;

	const extra: string[] = [];
	for (const t of longer) {
		if (!shorter.has(t)) extra.push(t);
	}

	if (shorter.size === 1 && shorter.has("pepper")) {
		for (const t of extra) {
			if (PEPPER_VEGETABLE_MODIFIERS.has(t)) return false;
		}
	}

	if (shorter.size === 1) {
		const sole = [...shorter][0];
		if (FRAGILE_HEADS.has(sole)) {
			for (const t of extra) {
				if (FRAGILE_BLOCKING_MODIFIERS.has(t)) return false;
			}
		}
	}

	return true;
}

/** Full token-phase predicate (head-noun path or leading-token specialization). */
export function isTokenPhaseMatch(
	recipeName: string,
	cargoName: string,
): boolean {
	const recipeNorm = normalizeForCargoDedup(recipeName);
	const cargoNorm = normalizeForCargoDedup(cargoName);
	if (!recipeNorm || !cargoNorm || recipeNorm === cargoNorm) return false;
	if (ULTRA_GENERIC_HEADS.has(headNoun(recipeNorm))) return false;

	const headPath = isBidirectionalHeadNounSubset(recipeNorm, cargoNorm);
	const leadPath = isLeadingTokenSpecialization(recipeNorm, cargoNorm);
	if (!headPath && !leadPath) return false;
	return passesCompoundGuard(recipeNorm, cargoNorm);
}

export type CargoTokenIndexes = {
	/** last token → normalized cargo keys */
	byHeadNoun: Map<string, string[]>;
	/** first token → normalized cargo keys */
	byLeadingToken: Map<string, string[]>;
};

function pushIndex(map: Map<string, string[]>, key: string, value: string) {
	const existing = map.get(key);
	if (existing) {
		existing.push(value);
	} else {
		map.set(key, [value]);
	}
}

/** Build inverted token indexes from normalized cargo keys (O(n)). */
export function buildCargoTokenIndexes(
	normalizedCargoKeys: Iterable<string>,
): CargoTokenIndexes {
	const byHeadNoun = new Map<string, string[]>();
	const byLeadingToken = new Map<string, string[]>();
	for (const key of normalizedCargoKeys) {
		const head = headNoun(key);
		const lead = leadingToken(key);
		if (head) pushIndex(byHeadNoun, head, key);
		if (lead) pushIndex(byLeadingToken, lead, key);
	}
	return { byHeadNoun, byLeadingToken };
}

/**
 * Given a recipe ingredient name and cargo token indexes, return cargo keys that
 * pass token-phase matching (exact keys excluded — handled separately).
 */
export function cargoKeysMatchingIngredient(
	recipeName: string,
	indexes: CargoTokenIndexes,
): string[] {
	const recipeNorm = normalizeForCargoDedup(recipeName);
	const head = headNoun(recipeNorm);
	if (!head || ULTRA_GENERIC_HEADS.has(head)) return [];

	const candidateSet = new Set<string>();
	for (const k of indexes.byHeadNoun.get(head) ?? []) {
		candidateSet.add(k);
	}
	const lead = leadingToken(recipeNorm);
	const recipeTokenCount = tokensOfNormalized(recipeNorm).size;
	if (recipeTokenCount === 1 && lead) {
		for (const k of indexes.byLeadingToken.get(lead) ?? []) {
			candidateSet.add(k);
		}
	}

	const matches: string[] = [];
	for (const cargoKey of candidateSet) {
		if (cargoKey === recipeNorm) continue;
		if (!isTokenPhaseMatch(recipeNorm, cargoKey)) continue;
		matches.push(cargoKey);
	}
	return matches;
}
