import { normalizeForMatch } from "~/lib/matching";
import { emitNutritionResolve } from "~/lib/telemetry.server";
import {
	NUTRITION_DATASET_SNAPSHOT_ID,
	NUTRITION_FDC_CACHE_TTL_SECONDS,
	NUTRITION_FDC_NEGATIVE_CACHE_TTL_SECONDS,
	NUTRITION_MATCHER_VERSION,
	nutritionMatchCacheKey,
} from "./constants";
import { sha256Hex } from "./hash";
import {
	readOrgMatchDecision,
	upsertOrgMatchDecision,
} from "./match-ledger.server";
import { classifyOrgLedgerDecision } from "./org-ledger-gate";
import {
	type FoodMatchCandidate,
	fragileHeadForPrimaryPrefix,
	mergeFoodMatchCandidates,
	pickBestFoodMatch,
	primaryPrefixLikePatterns,
} from "./rank-food-match";
import type {
	NullableNutrientValues,
	NutritionMatchMeta,
	NutritionProvenance,
	ResolvedFood,
} from "./types";

type FoodNutrientRow = {
	fdc_id: number;
	description: string;
	data_type: string | null;
	energy_kcal: number | null;
	protein_g: number | null;
	fat_g: number | null;
	carb_g: number | null;
	fiber_g: number | null;
	sugar_g: number | null;
	sat_fat_g: number | null;
	sodium_mg: number | null;
	salt_g: number | null;
	energy_nutrient_id: number | null;
	salt_derivation: string | null;
};

type CachedResolvedFood = ResolvedFood & { miss?: never };
type CachedMiss = { miss: true };

const CANDIDATE_LIMIT = 80;
const PRIMARY_PREFIX_LIMIT = 20;

type FtsCandidateFetch =
	| { ok: true; candidates: FoodMatchCandidate[] }
	| { ok: false };

export type ResolveFoodNameOptions = {
	organizationId?: string;
	userId?: string;
	/** Persist automatic hit/miss to org ledger (default true when org provided). */
	writeLedger?: boolean;
	/**
	 * When true, only auto-accept matches are returned as attached resolutions.
	 * Default false: medium-quality USDA matches attach for scan review / propose
	 * (clerical band). Callers that need strict auto-attach pass true.
	 */
	requireAutoAccept?: boolean;
};

function isCachedMiss(value: unknown): value is CachedMiss {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as CachedMiss).miss === true
	);
}

/**
 * Resolve a food name against NUTRITION_DB (USDA-shaped).
 * Lookup: org ledger → versioned KV → FTS5 (bm25) → JS re-rank.
 * No unindexed `%LIKE%` fallback.
 */
export async function resolveFoodName(
	env: Env,
	name: string,
	opts?: ResolveFoodNameOptions,
): Promise<ResolvedFood | null> {
	if (!env.NUTRITION_DB) {
		emitNutritionResolve("unavailable");
		return null;
	}

	const normalized = normalizeForMatch(name);
	if (!normalized) {
		emitNutritionResolve("miss");
		return null;
	}

	const requireAutoAccept = opts?.requireAutoAccept === true;
	const writeLedger = opts?.writeLedger !== false && !!opts?.organizationId;

	if (opts?.organizationId) {
		const decision = await readOrgMatchDecision(
			env,
			opts.organizationId,
			normalized,
		);
		if (decision) {
			const gate = classifyOrgLedgerDecision(decision, requireAutoAccept);
			if (gate === "miss") {
				emitNutritionResolve("miss");
				return null;
			}
			if (gate === "abstain") {
				emitNutritionResolve("abstain");
				return null;
			}
			if (gate === "attach" && decision.fdcId != null) {
				const hydrated = await hydrateFdcId(env, decision.fdcId, {
					matchScore: decision.matchScore ?? undefined,
					scoreMargin: decision.scoreMargin ?? undefined,
					matchQuality: decision.matchQuality ?? "high",
					autoAccept:
						decision.matchQuality === "high" ||
						decision.matchQuality === "verified" ||
						decision.decisionSource === "user" ||
						decision.decisionSource === "barcode",
					method: decision.decisionSource === "user" ? "user" : "org_ledger",
				});
				if (hydrated) {
					emitNutritionResolve("hit");
					return hydrated;
				}
			}
			// gate === "ignore" (or attach hydrate failed) → FTS below
		}
	}

	const nameHash = await sha256Hex(normalized);
	const cacheKey = nutritionMatchCacheKey(nameHash);
	const kv = env.RATION_KV;

	if (kv) {
		try {
			const cached = await kv.get<CachedResolvedFood | CachedMiss>(
				cacheKey,
				"json",
			);
			if (isCachedMiss(cached)) {
				emitNutritionResolve("miss");
				return null;
			}
			if (cached?.fdcId && cached.nutrientsPer100g) {
				if (requireAutoAccept && cached.autoAccept === false) {
					emitNutritionResolve("abstain");
					return null;
				}
				emitNutritionResolve("hit");
				return cached;
			}
		} catch {
			// ignore cache read failures
		}
	}

	const fetchResult = await fetchFtsCandidates(env.NUTRITION_DB, normalized);
	if (!fetchResult.ok) {
		// Soft-fail: do not poison KV / org miss cache on FTS errors.
		emitNutritionResolve("miss");
		return null;
	}
	const candidates = fetchResult.candidates;
	const best = pickBestFoodMatch(normalized, candidates);
	if (!best) {
		await cacheMiss(kv, cacheKey);
		if (writeLedger && opts?.organizationId) {
			await upsertOrgMatchDecision(env, {
				organizationId: opts.organizationId,
				normalizedName: normalized,
				fdcId: null,
				description: null,
				resolutionKind: "miss",
				decisionSource: "automatic",
				matchQuality: null,
				matchScore: null,
				scoreMargin: null,
			});
		}
		emitNutritionResolve("miss");
		return null;
	}

	const hydrated = await hydrateFdcId(env, best.fdcId, {
		matchScore: best.score,
		normalizedScore: best.normalizedScore,
		scoreMargin: best.margin,
		matchQuality: best.quality,
		autoAccept: best.autoAccept,
		method: "fts_rank",
	});

	if (!hydrated) {
		await cacheMiss(kv, cacheKey);
		emitNutritionResolve("miss");
		return null;
	}

	if (kv && best.autoAccept) {
		try {
			await kv.put(cacheKey, JSON.stringify(hydrated), {
				expirationTtl: NUTRITION_FDC_CACHE_TTL_SECONDS,
			});
		} catch {
			// ignore
		}
	}

	if (writeLedger && opts?.organizationId) {
		if (best.autoAccept) {
			await upsertOrgMatchDecision(env, {
				organizationId: opts.organizationId,
				normalizedName: normalized,
				fdcId: best.fdcId,
				description: best.description,
				resolutionKind: "hit",
				decisionSource: "automatic",
				matchQuality: best.quality,
				matchScore: best.score,
				scoreMargin: best.margin,
			});
		} else if (best.quality === "medium") {
			// Persist medium with fdcId (short TTL). Never write review+null —
			// that poisoned lookups for 30 days under the old matcher.
			await upsertOrgMatchDecision(env, {
				organizationId: opts.organizationId,
				normalizedName: normalized,
				fdcId: best.fdcId,
				description: best.description,
				resolutionKind: "review",
				decisionSource: "automatic",
				matchQuality: best.quality,
				matchScore: best.score,
				scoreMargin: best.margin,
			});
		}
	}

	if (requireAutoAccept && !best.autoAccept) {
		emitNutritionResolve("abstain");
		return null;
	}

	// Low-quality winners still fail closed even when medium attach is allowed.
	if (!best.autoAccept && best.quality === "low") {
		emitNutritionResolve("abstain");
		return null;
	}

	emitNutritionResolve("hit");
	return hydrated;
}

async function fetchFtsCandidates(
	db: D1Database,
	normalized: string,
): Promise<FtsCandidateFetch> {
	const ftsQuery = buildFtsQuery(normalized);
	let ftsCandidates: FoodMatchCandidate[] = [];
	let ftsOk = true;

	if (ftsQuery) {
		try {
			const ftsRows = await db
				.prepare(
					`SELECT f.fdc_id AS fdc_id, f.description AS description, f.data_type AS data_type,
            bm25(food_fts) AS rank
           FROM food_fts
           JOIN food f ON f.fdc_id = food_fts.rowid
           WHERE food_fts MATCH ?
           ORDER BY rank ASC,
             CASE WHEN f.data_type IN ('foundation_food', 'foundation') THEN 0 ELSE 1 END ASC,
             f.fdc_id ASC
           LIMIT ?`,
				)
				.bind(ftsQuery, CANDIDATE_LIMIT)
				.all<{
					fdc_id: number;
					description: string;
					data_type: string | null;
					rank: number;
				}>();

			ftsCandidates = (ftsRows.results ?? []).map((r) => ({
				fdcId: r.fdc_id,
				description: r.description,
				dataType: r.data_type ?? undefined,
			}));
		} catch {
			ftsOk = false;
		}
	}

	const prefixCandidates = await fetchPrimaryPrefixCandidates(db, normalized);
	if (!ftsOk && ftsCandidates.length === 0 && prefixCandidates.length === 0) {
		return { ok: false };
	}

	return {
		ok: true,
		candidates: mergeFoodMatchCandidates(ftsCandidates, prefixCandidates),
	};
}

/**
 * Pull commodity primaries (e.g. Milk,%) so FTS phrase noise cannot crowd
 * dairy out of the ranker window.
 */
async function fetchPrimaryPrefixCandidates(
	db: D1Database,
	normalized: string,
): Promise<FoodMatchCandidate[]> {
	const head = fragileHeadForPrimaryPrefix(normalized);
	if (!head) return [];

	const patterns = primaryPrefixLikePatterns(head);
	const merged: FoodMatchCandidate[] = [];
	const seen = new Set<number>();

	for (const pattern of patterns) {
		try {
			const rows = await db
				.prepare(
					`SELECT f.fdc_id AS fdc_id, f.description AS description, f.data_type AS data_type
           FROM food f
           WHERE f.description LIKE ? ESCAPE '\\'
           ORDER BY
             CASE WHEN f.data_type IN ('foundation_food', 'foundation') THEN 0 ELSE 1 END ASC,
             f.fdc_id ASC
           LIMIT ?`,
				)
				.bind(pattern, PRIMARY_PREFIX_LIMIT)
				.all<{
					fdc_id: number;
					description: string;
					data_type: string | null;
				}>();

			for (const r of rows.results ?? []) {
				if (seen.has(r.fdc_id)) continue;
				seen.add(r.fdc_id);
				merged.push({
					fdcId: r.fdc_id,
					description: r.description,
					dataType: r.data_type ?? undefined,
				});
			}
		} catch {
			// Prefix bank is best-effort; FTS bank still ranks.
		}
	}

	return merged;
}

async function hydrateFdcId(
	env: Env,
	fdcId: number,
	meta: {
		matchScore?: number;
		normalizedScore?: number;
		scoreMargin?: number;
		matchQuality?: ResolvedFood["matchQuality"];
		autoAccept?: boolean;
		method: NutritionMatchMeta["method"];
	},
): Promise<ResolvedFood | null> {
	const db = env.NUTRITION_DB;
	if (!db) return null;

	let nutrientRow: FoodNutrientRow | null = null;
	try {
		nutrientRow = await db
			.prepare(
				`SELECT f.fdc_id, f.description, f.data_type,
          n.energy_kcal, n.protein_g, n.fat_g, n.carb_g,
          n.fiber_g, n.sugar_g, n.sat_fat_g, n.sodium_mg, n.salt_g,
          n.energy_nutrient_id, n.salt_derivation
         FROM food f
         JOIN food_nutrient n ON n.fdc_id = f.fdc_id
         WHERE f.fdc_id = ?
         LIMIT 1`,
			)
			.bind(fdcId)
			.first<FoodNutrientRow>();
	} catch {
		return null;
	}

	if (!nutrientRow) return null;

	const nutrientsPer100g = rowToNutrients(nutrientRow);
	const matchQuality = meta.matchQuality ?? "unknown";
	const autoAccept = meta.autoAccept === true;
	const provenance = buildProvenance(nutrientRow);
	const match: NutritionMatchMeta = {
		matcherVersion: NUTRITION_MATCHER_VERSION,
		quality: matchQuality,
		score: meta.normalizedScore ?? meta.matchScore ?? null,
		margin: meta.scoreMargin ?? null,
		method: meta.method,
	};

	return {
		fdcId: nutrientRow.fdc_id,
		description: nutrientRow.description,
		dataType: nutrientRow.data_type,
		nutrientsPer100g,
		matchScore: meta.matchScore,
		normalizedScore: meta.normalizedScore,
		scoreMargin: meta.scoreMargin,
		matchQuality,
		autoAccept,
		highConfidence: autoAccept,
		energyNutrientId: nutrientRow.energy_nutrient_id,
		saltDerivation: nutrientRow.salt_derivation,
		provenance,
		match,
	};
}

function buildProvenance(row: FoodNutrientRow): NutritionProvenance {
	return {
		provider: "usda_fdc",
		dataType: row.data_type,
		datasetRelease: null,
		datasetSnapshotId: NUTRITION_DATASET_SNAPSHOT_ID,
		importedAt: null,
		nutrientIds: {
			energyKcal: row.energy_nutrient_id,
		},
		derivations: row.salt_derivation ? { saltG: row.salt_derivation } : null,
		model: null,
		promptVersion: null,
		generatedAt: null,
	};
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
		// ignore
	}
}

/** Preserve null for unknown core macros — never coerce to 0. */
export function rowToNutrients(row: {
	energy_kcal: number | null;
	protein_g: number | null;
	fat_g: number | null;
	carb_g: number | null;
	fiber_g: number | null;
	sugar_g: number | null;
	sat_fat_g: number | null;
	sodium_mg: number | null;
	salt_g: number | null;
}): NullableNutrientValues {
	return {
		energyKcal: row.energy_kcal,
		proteinG: row.protein_g,
		fatG: row.fat_g,
		carbG: row.carb_g,
		fiberG: row.fiber_g,
		sugarG: row.sugar_g,
		satFatG: row.sat_fat_g,
		sodiumMg: row.sodium_mg,
		saltG: row.salt_g,
	};
}

/** @deprecated LIKE fallback removed — kept for tests of escape helper only. */
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
