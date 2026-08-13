import type { CargoIndexRow } from "./cargo-index.server";
import { fetchOrgCargoIndex } from "./cargo-index.server";
import type { CargoLinkedIngredient } from "./cargo-links";
import {
	buildCargoIndex,
	buildCargoTokenIndexes,
	type CargoBucketMatchType,
	type CargoIndexEntry,
	resolveCargoBucketsForIngredient,
} from "./matching.server";
import { getMatchCacheVersion } from "./readiness-cache.server";
import { findSimilarCargoBatch, SIMILARITY_THRESHOLDS } from "./vector.server";

const ING_LINKS_CACHE_PREFIX = "ing-links:";
const ING_LINKS_CACHE_TTL_SECONDS = 600;

export type IngredientCargoMatchType = Exclude<CargoBucketMatchType, "none">;

export type IngredientCargoLink = {
	cargoIds: string[];
	primaryCargoId: string | null;
	matchType: CargoBucketMatchType;
};

type CachedIngredientLinks = {
	entries: Record<string, IngredientCargoLink>;
};

export function ingredientLinksCacheKey(
	organizationId: string,
	version: string,
): string {
	return `${ING_LINKS_CACHE_PREFIX}${organizationId}:${version}`;
}

export function pickPrimaryCargoEntry(
	buckets: CargoIndexEntry[],
): CargoIndexEntry | null {
	if (buckets.length === 0) return null;
	let best = buckets[0];
	for (let i = 1; i < buckets.length; i++) {
		if (buckets[i].totalQuantity > best.totalQuantity) {
			best = buckets[i];
		}
	}
	return best;
}

function linkFromBuckets(
	buckets: CargoIndexEntry[],
	matchType: CargoBucketMatchType,
): IngredientCargoLink {
	const cargoIds = [...new Set(buckets.map((b) => b.original.id))];
	const primary = pickPrimaryCargoEntry(buckets);
	return {
		cargoIds,
		primaryCargoId: primary?.original.id ?? null,
		matchType: cargoIds.length === 0 ? "none" : matchType,
	};
}

async function readCachedLinks(
	kv: KVNamespace | undefined,
	key: string,
): Promise<CachedIngredientLinks | null> {
	if (!kv) return null;
	try {
		const cached = await kv.get(key, "json");
		if (
			cached &&
			typeof cached === "object" &&
			"entries" in cached &&
			typeof (cached as CachedIngredientLinks).entries === "object"
		) {
			return cached as CachedIngredientLinks;
		}
	} catch {
		return null;
	}
	return null;
}

async function writeCachedLinks(
	kv: KVNamespace | undefined,
	key: string,
	payload: CachedIngredientLinks,
): Promise<void> {
	if (!kv) return;
	try {
		await kv.put(key, JSON.stringify(payload), {
			expirationTtl: ING_LINKS_CACHE_TTL_SECONDS,
		});
	} catch {
		// Cache write is best-effort
	}
}

/**
 * Resolves ingredient names to org cargo ids using the same exact → token →
 * vector phases as cook / meal-match. Results are merged into an org KV cache
 * keyed by readiness match version so cargo-detail reverse lookups reuse work.
 */
export async function resolveIngredientCargoLinks(
	env: Env,
	organizationId: string,
	ingredientNames: string[],
	options?: { cargoRows?: CargoIndexRow[] },
): Promise<Map<string, IngredientCargoLink>> {
	const uniqueNames = [
		...new Set(ingredientNames.filter((name) => name.trim().length > 0)),
	];
	const result = new Map<string, IngredientCargoLink>();
	if (uniqueNames.length === 0) return result;

	const version = await getMatchCacheVersion(env.RATION_KV, organizationId);
	const cacheKey = ingredientLinksCacheKey(organizationId, version);
	const cached = await readCachedLinks(env.RATION_KV, cacheKey);
	const entries = { ...(cached?.entries ?? {}) };

	const missing: string[] = [];
	for (const name of uniqueNames) {
		const hit = entries[name];
		if (hit) {
			result.set(name, hit);
		} else {
			missing.push(name);
		}
	}

	if (missing.length === 0) return result;

	const cargoRows =
		options?.cargoRows ?? (await fetchOrgCargoIndex(env.DB, organizationId));
	const cargoIndex = buildCargoIndex(cargoRows);
	const tokenIndexes = buildCargoTokenIndexes(cargoIndex.keys());

	const vectorMissNames: string[] = [];
	for (const name of missing) {
		const { buckets, matchType } = resolveCargoBucketsForIngredient(
			name,
			cargoIndex,
			tokenIndexes,
			new Map(),
		);
		if (matchType === "exact" || matchType === "token") {
			const link = linkFromBuckets(buckets, matchType);
			entries[name] = link;
			result.set(name, link);
		} else {
			vectorMissNames.push(name);
		}
	}

	if (vectorMissNames.length > 0) {
		const similarityMap = await findSimilarCargoBatch(
			env,
			organizationId,
			vectorMissNames,
			{
				topK: 3,
				threshold: SIMILARITY_THRESHOLDS.INGREDIENT_MATCH,
			},
		);
		for (const name of vectorMissNames) {
			const { buckets, matchType } = resolveCargoBucketsForIngredient(
				name,
				cargoIndex,
				tokenIndexes,
				similarityMap,
			);
			const link = linkFromBuckets(buckets, matchType);
			entries[name] = link;
			result.set(name, link);
		}
	}

	await writeCachedLinks(env.RATION_KV, cacheKey, { entries });
	return result;
}

/**
 * Meal-detail enrichment: prefer an explicit org-scoped cargoId, then the
 * operational resolver (exact / token / vector).
 */
export async function enrichIngredientsWithResolvedCargo<
	T extends { ingredientName: string; cargoId?: string | null },
>(
	env: Env,
	organizationId: string,
	ingredients: T[],
): Promise<CargoLinkedIngredient<T>[]> {
	if (ingredients.length === 0) return [];

	const cargoRows = await fetchOrgCargoIndex(env.DB, organizationId);
	const orgCargoIds = new Set(cargoRows.map((row) => row.id));

	const namesNeedingResolve = ingredients
		.filter((ing) => !ing.cargoId || !orgCargoIds.has(ing.cargoId))
		.map((ing) => ing.ingredientName);

	const links =
		namesNeedingResolve.length > 0
			? await resolveIngredientCargoLinks(
					env,
					organizationId,
					namesNeedingResolve,
					{ cargoRows },
				)
			: new Map<string, IngredientCargoLink>();

	return ingredients.map((ing) => {
		if (ing.cargoId && orgCargoIds.has(ing.cargoId)) {
			return { ...ing, resolvedCargoId: ing.cargoId };
		}
		const primary = links.get(ing.ingredientName)?.primaryCargoId;
		return primary ? { ...ing, resolvedCargoId: primary } : { ...ing };
	});
}

export function connectionTypeFromMatch(
	matchType: CargoBucketMatchType,
): IngredientCargoMatchType | null {
	if (matchType === "none") return null;
	return matchType;
}
