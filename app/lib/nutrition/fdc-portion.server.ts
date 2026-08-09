/**
 * FDC portion lookup against NUTRITION_DB `food_portion`.
 */
import { normalizeForMatch } from "~/lib/matching";
import type { SupportedUnit } from "~/lib/units";
import { getUnitFamily } from "~/lib/units";
import {
	NUTRITION_FDC_CACHE_TTL_SECONDS,
	nutritionPortionCacheKey,
} from "./constants";
import { sha256Hex } from "./hash";

export type FdcPortionRow = {
	id: number;
	fdcId: number;
	portionDescription: string | null;
	gramWeight: number;
	amount: number | null;
	measureUnit: string | null;
};

export type FdcPortionLookupResult = {
	portion: FdcPortionRow | null;
	gramsPerUnit: number | null;
	fromCache: boolean;
};

type CachedPortion = {
	portion: FdcPortionRow | null;
	gramsPerUnit: number | null;
};

/**
 * Resolve a USDA portion by FDC id + unit / description hint.
 * Uses gramsPerUnit = gramWeight / amount (amount defaults to 1).
 */
export async function lookupFdcPortion(
	env: Env,
	fdcId: number,
	unitOrHint?: string | null,
): Promise<FdcPortionLookupResult> {
	if (!env.NUTRITION_DB || !Number.isFinite(fdcId)) {
		return { portion: null, gramsPerUnit: null, fromCache: false };
	}

	const hint = (unitOrHint ?? "").trim().toLowerCase().slice(0, 80);
	const hintHash = await sha256Hex(hint || "default");
	const cacheKey = nutritionPortionCacheKey(fdcId, hint || "default", hintHash);
	const kv = env.RATION_KV;

	if (kv) {
		try {
			const cached = await kv.get<CachedPortion>(cacheKey, "json");
			if (cached && "portion" in cached) {
				return {
					portion: cached.portion,
					gramsPerUnit: cached.gramsPerUnit,
					fromCache: true,
				};
			}
		} catch {
			// ignore
		}
	}

	let rows: FdcPortionRow[] = [];
	try {
		const result = await env.NUTRITION_DB.prepare(
			`SELECT id, fdc_id AS fdcId, modifier AS portionDescription,
        gram_weight AS gramWeight, amount, measure_unit AS measureUnit
       FROM food_portion
       WHERE fdc_id = ?
       LIMIT 40`,
		)
			.bind(fdcId)
			.all<{
				id: number;
				fdcId: number;
				portionDescription: string | null;
				gramWeight: number;
				amount: number | null;
				measureUnit: string | null;
			}>();
		rows = (result.results ?? []).map((r) => ({
			id: r.id,
			fdcId: r.fdcId,
			portionDescription: r.portionDescription,
			gramWeight: r.gramWeight,
			amount: r.amount,
			measureUnit: r.measureUnit,
		}));
	} catch {
		return { portion: null, gramsPerUnit: null, fromCache: false };
	}

	const matched = pickBestPortion(rows, hint);
	const gramsPerUnit = matched ? gramsPerUnitFromPortion(matched) : null;
	const payload: CachedPortion = { portion: matched, gramsPerUnit };

	if (kv) {
		try {
			await kv.put(cacheKey, JSON.stringify(payload), {
				expirationTtl: NUTRITION_FDC_CACHE_TTL_SECONDS,
			});
		} catch {
			// ignore
		}
	}

	return { portion: matched, gramsPerUnit, fromCache: false };
}

/** Scale quantity × FDC portion into grams for nutrition mass resolution. */
export async function resolveFdcPortionGrams(
	env: Env,
	fdcId: number,
	quantity: number,
	unit: SupportedUnit | null | undefined,
): Promise<{
	grams: number | null;
	portion: FdcPortionRow | null;
	confidence: number;
}> {
	if (!Number.isFinite(quantity) || quantity <= 0 || unit == null) {
		return { grams: null, portion: null, confidence: 0 };
	}

	const family = getUnitFamily(unit);
	if (
		family !== "count_unit" &&
		family !== "count_can" &&
		family !== "count_pack"
	) {
		return { grams: null, portion: null, confidence: 0 };
	}

	const { portion, gramsPerUnit } = await lookupFdcPortion(env, fdcId, unit);
	if (portion == null || gramsPerUnit == null || gramsPerUnit <= 0) {
		return { grams: null, portion: null, confidence: 0 };
	}

	return {
		grams: gramsPerUnit * quantity,
		portion,
		confidence: 0.9,
	};
}

export function gramsPerUnitFromPortion(portion: FdcPortionRow): number | null {
	const amount =
		portion.amount != null &&
		Number.isFinite(portion.amount) &&
		portion.amount > 0
			? portion.amount
			: 1;
	if (!Number.isFinite(portion.gramWeight) || portion.gramWeight <= 0) {
		return null;
	}
	return portion.gramWeight / amount;
}

function pickBestPortion(
	rows: FdcPortionRow[],
	hint: string,
): FdcPortionRow | null {
	if (rows.length === 0) return null;
	if (!hint) {
		// Without a unit/modifier hint, only accept a single unambiguous portion.
		return rows.length === 1 ? (rows[0] ?? null) : null;
	}

	const hintNorm = normalizeForMatch(hint);
	const scored = rows.map((row) => {
		const unit = normalizeForMatch(row.measureUnit ?? "");
		const mod = normalizeForMatch(row.portionDescription ?? "");
		let score = 0;
		if (unit === hintNorm || mod === hintNorm) score += 100;
		else if (unit.includes(hintNorm) || mod.includes(hintNorm)) score += 60;
		else if (hintNorm.includes(unit) && unit.length >= 2) score += 40;
		return { row, score };
	});

	scored.sort((a, b) => b.score - a.score);
	const best = scored[0];
	const second = scored[1];
	if (!best || best.score < 40) return null;
	// Ambiguous partial matches abstain.
	if (second && second.score === best.score && best.score < 100) return null;
	return best.row;
}

/** @deprecated Prefer {@link nutritionPortionCacheKey}. */
export function fdcPortionCacheKey(
	fdcId: number,
	portionDescription: string | null | undefined,
): string {
	const hint = (portionDescription ?? "default")
		.trim()
		.toLowerCase()
		.slice(0, 80);
	return `nutrition:fdc:portion:${fdcId}:${hint}`;
}
