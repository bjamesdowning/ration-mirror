import { normalizeForMatch } from "~/lib/matching";
import {
	NUTRITION_FDC_CACHE_TTL_SECONDS,
	NUTRITION_FDC_KV_PREFIX,
} from "./constants";
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

type CachedResolvedFood = ResolvedFood;

/**
 * Resolve a food name against NUTRITION_DB (USDA-shaped seed).
 * Returns null when the binding is absent or no match is found.
 *
 * Lookup order: KV cache → FTS5 MATCH → LIKE fallback → cache hit (7d).
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
			const cached = await kv.get<CachedResolvedFood>(cacheKey, "json");
			if (cached?.fdcId && cached.nutrientsPer100g) {
				return cached;
			}
		} catch {
			// ignore cache read failures
		}
	}

	const db = env.NUTRITION_DB;
	let row: FoodNutrientRow | null = null;

	const ftsQuery = buildFtsQuery(normalized);
	if (ftsQuery) {
		try {
			row = await db
				.prepare(
					`SELECT f.fdc_id, f.description,
            n.energy_kcal, n.protein_g, n.fat_g, n.carb_g,
            n.fiber_g, n.sugar_g, n.sat_fat_g, n.sodium_mg, n.salt_g
           FROM food_fts
           JOIN food f ON f.fdc_id = food_fts.rowid
           JOIN food_nutrient n ON n.fdc_id = f.fdc_id
           WHERE food_fts MATCH ?
           LIMIT 1`,
				)
				.bind(ftsQuery)
				.first<FoodNutrientRow>();
		} catch {
			// FTS unavailable or query error — fall through to LIKE
		}
	}

	if (!row) {
		try {
			row = await db
				.prepare(
					`SELECT f.fdc_id, f.description,
            n.energy_kcal, n.protein_g, n.fat_g, n.carb_g,
            n.fiber_g, n.sugar_g, n.sat_fat_g, n.sodium_mg, n.salt_g
           FROM food f
           JOIN food_nutrient n ON n.fdc_id = f.fdc_id
           WHERE lower(f.description) LIKE ?
           ORDER BY length(f.description) ASC
           LIMIT 1`,
				)
				.bind(`%${normalized}%`)
				.first<FoodNutrientRow>();
		} catch {
			return null;
		}
	}

	if (!row) return null;

	const resolved: ResolvedFood = {
		fdcId: row.fdc_id,
		description: row.description,
		nutrientsPer100g: rowToNutrients(row),
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

/** Build a safe FTS5 MATCH query from a normalized name (AND of tokens). */
function buildFtsQuery(normalized: string): string | null {
	const tokens = normalized
		.split(/\s+/)
		.map((t) => t.replace(/[^a-z0-9]/gi, ""))
		.filter((t) => t.length >= 2);
	if (tokens.length === 0) return null;
	return tokens.map((t) => `"${t}"`).join(" ");
}
