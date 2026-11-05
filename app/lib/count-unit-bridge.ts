/**
 * Ingredient-aware conversions between culinary count nouns.
 *
 * Clove, slice, head, stalk, sprig, and bunch are not interchangeable with
 * `unit`. A few foods have a known whole-to-part ratio. Everything else keeps
 * a 1:1 link only when the pantry noun means one item (`head` of lettuce,
 * `slice` of cheese). Cloves never fall back to that 1:1.
 *
 * Ratios are counts, not grams. A person-confirmed grams-per-unit link stays
 * on the nutrition path and is not replaced here.
 */

import { normalizeForMatch } from "./matching";

type CountFactor = Record<string, number>;

type CountBridge = {
	matches: (tokens: Set<string>) => boolean;
	/** How many of `smallest` each noun contains. */
	per: CountFactor;
	smallest: string;
};

const GARLIC_PREPARED = new Set([
	"aioli",
	"flake",
	"flakes",
	"granule",
	"granules",
	"granulated",
	"oil",
	"paste",
	"powder",
	"salt",
]);

const BREAD_PREPARED = new Set(["crumb", "crumbs", "flour", "pudding"]);

const HERB_PREPARED = new Set(["ground", "powder", "seed", "seeds"]);

const HERBS = new Set([
	"basil",
	"chive",
	"chives",
	"cilantro",
	"coriander",
	"dill",
	"herb",
	"herbs",
	"marjoram",
	"mint",
	"oregano",
	"parsley",
	"rosemary",
	"sage",
	"tarragon",
	"thyme",
]);

/**
 * 1 head of garlic is one bulb, about 10 cloves.
 * Cargo on iOS is stored as `unit`; that unit is the bulb, same as `head`.
 * `piece` shares the count family with `unit`, so it is the same bulb.
 */
const GARLIC: CountBridge = {
	matches: (tokens) => tokens.has("garlic") && !shares(tokens, GARLIC_PREPARED),
	per: { clove: 1, head: 10, unit: 10, piece: 10, dozen: 120 },
	smallest: "clove",
};

/** 1 loaf is about 20 slices. `unit` / `piece` / the word "loaf" are that loaf. */
const BREAD: CountBridge = {
	matches: (tokens) => tokens.has("bread") && !shares(tokens, BREAD_PREPARED),
	per: { slice: 1, unit: 20, piece: 20, dozen: 240 },
	smallest: "slice",
};

/** 1 head of celery is about 8 stalks. A pantry `unit` is that head. */
const CELERY: CountBridge = {
	matches: (tokens) =>
		tokens.has("celery") && !tokens.has("salt") && !tokens.has("seed"),
	per: { stalk: 1, head: 8, unit: 8, piece: 8, dozen: 96 },
	smallest: "stalk",
};

/** 1 bunch is about 10 sprigs. A pantry `unit` is that bunch. */
const HERB: CountBridge = {
	matches: (tokens) => shares(tokens, HERBS) && !shares(tokens, HERB_PREPARED),
	per: { sprig: 1, bunch: 10, unit: 10, piece: 10, dozen: 120 },
	smallest: "sprig",
};

const BRIDGES: readonly CountBridge[] = [GARLIC, BREAD, CELERY, HERB];

/**
 * When no food has a ratio, a head, bunch, stalk, slice, or sprig is still
 * one pantry item (lettuce, cheese). Dozen stays 12 of those items.
 * Clove is absent: 3 cloves are not 3 units of onion. Two different nouns
 * (slice and head) do not collapse into each other.
 */
const PANTRY_COUNT_PER_UNIT: CountFactor = {
	unit: 1,
	piece: 1,
	dozen: 12,
};
const PANTRY_ITEM_NOUNS = new Set(["head", "bunch", "stalk", "slice", "sprig"]);

const WHOLE_EPSILON = 1e-6;

function shares(tokens: Set<string>, words: Set<string>): boolean {
	for (const token of tokens) {
		if (words.has(token)) return true;
	}
	return false;
}

function tokensOf(name: string | null | undefined): Set<string> {
	if (name == null || String(name).trim() === "") return new Set();
	return new Set(normalizeForMatch(String(name)).split(" ").filter(Boolean));
}

function bridgeFor(
	tokens: Set<string>,
	from: string,
	to: string,
): CountBridge | null {
	for (const bridge of BRIDGES) {
		if (!bridge.matches(tokens)) continue;
		if (bridge.per[from] == null || bridge.per[to] == null) continue;
		return bridge;
	}
	return null;
}

function bridgeOwns(tokens: Set<string>, unit: string): boolean {
	for (const bridge of BRIDGES) {
		if (bridge.matches(tokens) && bridge.per[unit] != null) return true;
	}
	return false;
}

function genericPantryCount(
	quantity: number,
	from: string,
	to: string,
): number | null {
	const fromCount = PANTRY_COUNT_PER_UNIT[from];
	const toCount = PANTRY_COUNT_PER_UNIT[to];
	const fromNoun = PANTRY_ITEM_NOUNS.has(from);
	const toNoun = PANTRY_ITEM_NOUNS.has(to);
	if (fromCount != null && toNoun) return quantity * fromCount;
	if (fromNoun && toCount != null) return quantity / toCount;
	return null;
}

/**
 * Convert `quantity` of `from` into `to` for this ingredient.
 * Returns null when the nouns are not a known pair. Never returns grams.
 */
export function convertCountBridge(
	quantity: number,
	from: string,
	to: string,
	ingredientName: string | null | undefined,
): number | null {
	if (!Number.isFinite(quantity)) return null;
	if (from === to) return quantity;
	const tokens = tokensOf(ingredientName);
	const bridge = bridgeFor(tokens, from, to);
	if (bridge) {
		const fromPer = bridge.per[from] as number;
		const toPer = bridge.per[to] as number;
		return (quantity * fromPer) / toPer;
	}
	if (bridgeOwns(tokens, from) || bridgeOwns(tokens, to)) return null;
	return genericPantryCount(quantity, from, to);
}

/**
 * When a merged count is a fraction of a bulb, loaf, or bunch, keep the
 * smaller noun so shopping round-to-whole does not drop the extra cloves
 * or slices (1.3 heads would round to 1).
 */
export function preferExactCountBase(
	quantity: number,
	unit: string,
	ingredientName: string | null | undefined,
): { quantity: number; unit: string } {
	if (!Number.isFinite(quantity)) return { quantity, unit };
	const tokens = tokensOf(ingredientName);
	const bridge = BRIDGES.find(
		(candidate) => candidate.matches(tokens) && candidate.per[unit] != null,
	);
	if (!bridge) return { quantity, unit };
	const per = bridge.per[unit] as number;
	if (Math.abs(quantity - Math.round(quantity)) <= WHOLE_EPSILON) {
		return { quantity: Math.round(quantity), unit };
	}
	const smallestPer = bridge.per[bridge.smallest] ?? 1;
	return {
		quantity: (quantity * per) / smallestPer,
		unit: bridge.smallest,
	};
}
