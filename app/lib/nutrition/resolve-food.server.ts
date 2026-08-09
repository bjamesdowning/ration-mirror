import { normalizeForMatch } from "~/lib/matching";
import {
	NUTRITION_FDC_CACHE_TTL_SECONDS,
	NUTRITION_FDC_KV_PREFIX,
	NUTRITION_FDC_NEGATIVE_CACHE_TTL_SECONDS,
} from "./constants";
import { type FoodMatchCandidate, pickBestFoodMatch } from "./rank-food-match";
import type { NutrientsPer100g, ResolvedFood } from "./types";

type FoodNutrientRow = {
	fdc_id: number;
	description: string;
	energy_kcal: number | null;
	protein_g: number | null;
	fat_g: number | null;
	carb_g: number | null;
	fiber_g: number | null;
	sugar_g: number | null;
	sat_fat_g: number | null;
	sodium_mg: number | null;
	salt_g: number | null;
};

type CachedResolvedFood = ResolvedFood & { highConfidence?: boolean };
type CachedMiss = { miss: true };

const CANDIDATE_LIMIT = 40;

function isCachedMiss(value: unknown): value is CachedMiss {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as CachedMiss).miss === true
	);
}

/**
 * Resolve a food name against NUTRITION_DB (USDA-shaped seed).
 * Returns null when the binding is absent or no match is found.
 *
 * Lookup order: KV cache → FTS5 candidates → JS re-rank → LIKE candidates → re-rank.
 */
export async function resolveFoodName(
	env: Env,
	name: string,
): Promise<ResolvedFood | null> {
	if (!env.NUTRITION_DB) return null;

	const normalized = normalizeForMatch(name);
	if (!normalized) return null;

	const cacheKey = `${NUTRITION_FDC_KV_PREFIX}${normalized}`;
	const kv = env.RATION_KV;

	if (kv) {
		try {
			const cached = await kv.get<CachedResolvedFood | CachedMiss>(
				cacheKey,
				"json",
			);
			if (isCachedMiss(cached)) {
				return null;
			}
			if (cached?.fdcId && cached.nutrientsPer100g) {
				return cached;
			}
		} catch {
			// ignore cache read failures
		}
	}

	const db = env.NUTRITION_DB;
	let candidates: FoodMatchCandidate[] = [];

	const ftsQuery = buildFtsQuery(normalized);
	if (ftsQuery) {
		try {
			const ftsRows = await db
				.prepare(
					`SELECT f.fdc_id AS fdc_id, f.description AS description
           FROM food_fts
           JOIN food f ON f.fdc_id = food_fts.rowid
           WHERE food_fts MATCH ?
           LIMIT ?`,
				)
				.bind(ftsQuery, CANDIDATE_LIMIT)
				.all<{ fdc_id: number; description: string }>();
			candidates = (ftsRows.results ?? []).map((r) => ({
				fdcId: r.fdc_id,
				description: r.description,
			}));
		} catch {
			// FTS unavailable or query error — fall through to LIKE
		}
	}

	if (candidates.length === 0) {
		try {
			const likePattern = `%${escapeLikePattern(normalized)}%`;
			const likeRows = await db
				.prepare(
					`SELECT f.fdc_id AS fdc_id, f.description AS description
           FROM food f
           WHERE lower(f.description) LIKE ? ESCAPE '\\'
           ORDER BY length(f.description) ASC
           LIMIT ?`,
				)
				.bind(likePattern, CANDIDATE_LIMIT)
				.all<{ fdc_id: number; description: string }>();
			candidates = (likeRows.results ?? []).map((r) => ({
				fdcId: r.fdc_id,
				description: r.description,
			}));
		} catch {
			return null;
		}
	}

	const best = pickBestFoodMatch(normalized, candidates);
	if (!best) {
		await cacheMiss(kv, cacheKey);
		return null;
	}

	let nutrientRow: FoodNutrientRow | null = null;
	try {
		nutrientRow = await db
			.prepare(
				`SELECT f.fdc_id, f.description,
          n.energy_kcal, n.protein_g, n.fat_g, n.carb_g,
          n.fiber_g, n.sugar_g, n.sat_fat_g, n.sodium_mg, n.salt_g
         FROM food f
         JOIN food_nutrient n ON n.fdc_id = f.fdc_id
         WHERE f.fdc_id = ?
         LIMIT 1`,
			)
			.bind(best.fdcId)
			.first<FoodNutrientRow>();
	} catch {
		return null;
	}

	if (!nutrientRow) {
		await cacheMiss(kv, cacheKey);
		return null;
	}

	const resolved: CachedResolvedFood = {
		fdcId: nutrientRow.fdc_id,
		description: nutrientRow.description,
		nutrientsPer100g: rowToNutrients(nutrientRow),
		highConfidence: best.highConfidence,
		matchScore: best.score,
	};

	if (kv) {
		try {
			await kv.put(cacheKey, JSON.stringify(resolved), {
				expirationTtl: NUTRITION_FDC_CACHE_TTL_SECONDS,
			});
		} catch {
			// ignore cache write failures
		}
	}

	return resolved;
}

async function cacheMiss(
	kv: KVNamespace | undefined,
	cacheKey: string,
): Promise<void> {
	if (!kv) return;
	try {
		await kv.put(
			cacheKey,
			JSON.stringify({ miss: true } satisfies CachedMiss),
			{
				expirationTtl: NUTRITION_FDC_NEGATIVE_CACHE_TTL_SECONDS,
			},
		);
	} catch {
		// ignore cache write failures
	}
}

function rowToNutrients(row: FoodNutrientRow): NutrientsPer100g {
	return {
		energyKcal: row.energy_kcal ?? 0,
		proteinG: row.protein_g ?? 0,
		fatG: row.fat_g ?? 0,
		carbG: row.carb_g ?? 0,
		fiberG: row.fiber_g,
		sugarG: row.sugar_g,
		satFatG: row.sat_fat_g,
		sodiumMg: row.sodium_mg,
		saltG: row.salt_g,
	};
}

/** Escape LIKE wildcards so `_` / `%` in food names are literal. */
export function escapeLikePattern(value: string): string {
	return value.replace(/([\\%_])/g, "\\$1");
}

/** Build a safe FTS5 MATCH query from a normalized name (AND of tokens). */
function buildFtsQuery(normalized: string): string | null {
	const tokens = normalized
		.split(/\s+/)
		.map((t) => t.replace(/[^a-z0-9]/gi, ""))
		.filter((t) => t.length >= 2);
	if (tokens.length === 0) return null;
	return tokens.map((t) => `"${t}"`).join(" ");
}
