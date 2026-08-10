/**
 * Lookup curated / learned food aliases on NUTRITION_DB.
 */
import { normalizeForMatch } from "~/lib/matching";

export type FoodAliasHit = {
	fdcId: number;
	normalizedName: string;
	source: string;
};

export async function lookupFoodAlias(
	env: Env,
	normalizedName: string,
): Promise<FoodAliasHit | null> {
	const db = env.NUTRITION_DB;
	if (!db || !normalizedName) return null;
	try {
		const row = await db
			.prepare(
				`SELECT normalized_name AS normalizedName, fdc_id AS fdcId, source
         FROM food_alias
         WHERE normalized_name = ?
         LIMIT 1`,
			)
			.bind(normalizedName)
			.first<{
				normalizedName: string;
				fdcId: number;
				source: string;
			}>();
		if (!row?.fdcId) return null;
		return {
			fdcId: row.fdcId,
			normalizedName: row.normalizedName,
			source: row.source,
		};
	} catch {
		// Table may not exist yet on older DBs.
		return null;
	}
}

/** Normalize then look up. */
export async function lookupFoodAliasForName(
	env: Env,
	name: string,
): Promise<FoodAliasHit | null> {
	const normalized = normalizeForMatch(name);
	if (!normalized) return null;
	return lookupFoodAlias(env, normalized);
}
