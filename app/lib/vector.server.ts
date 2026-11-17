/**
 * Vectorize service for semantic cargo-to-galley ingredient matching.
 *
 * Flag `cargo-embedding-gemma-2` is off by default.
 * Off: `@cf/google/embeddinggemma-300m`, `{ text }` in, `{ shape, data: number[][] }` out,
 * KV prefix `vec:`, binding `VECTORIZE` (`ration-cargo`).
 * On: `@cf/google/embeddinggemma-2` at 768, new parser and cache key, binding
 * `VECTORIZE_EG2` (`ration-cargo-eg2`). The new path never reads `vec:` keys.
 */

import { sha256Hex } from "./crypto.server";
import type { FlagshipEvaluationContext } from "./feature-flags/context.server";
import { isFeatureEnabled } from "./feature-flags/flags.server";
import { log } from "./logging.server";
import { chunkArray } from "./query-utils.server";

export const CARGO_EMBEDDING_FLAG = "cargo-embedding-gemma-2";

export const EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";
export const EMBEDDING_GEMMA_2_MODEL = "@cf/google/embeddinggemma-2";
export const EMBEDDING_DIMENSIONS = 768;

/** Same string on a Cargo name and on a query. New path only. */
export const CLUSTER_PREFIX = "task: clustering | query: ";
/** Bumps the new-path cache key when the prefix changes. */
export const CLUSTER_PREFIX_VERSION = "v1";

const EMBED_CACHE_TTL = 60 * 60 * 24 * 7; // 7 days
const EMBED_CACHE_PREFIX = "vec:";

/**
 * Workers `deleteByIds` / `getByIds` payload cap.
 * Production: VECTOR_DELETE_ERROR (code = 40007) "too many ids in payload; max id count is 100".
 * Public limits docs list upsert batch 1000 but omit this delete cap.
 */
export const VECTORIZE_DELETE_BY_IDS_MAX = 100;

/** Documented Workers upsert batch. @see https://developers.cloudflare.com/vectorize/platform/limits/ */
export const VECTORIZE_UPSERT_MAX = 1000;

/** @cf/google/embeddinggemma-300m supports up to 100 inputs per request */
const EMBED_BATCH_SIZE = 100;

/**
 * embeddinggemma-2 does not document a batch cap. Stay under the old model's
 * 100 until a dev probe raises this.
 */
const EMBED_GEMMA_2_BATCH_SIZE = 16;

/** Similarity thresholds per context. Unflagged kitchens keep these. */
export const SIMILARITY_THRESHOLDS = {
	/** Universal threshold for ingredient → cargo resolution across all features */
	INGREDIENT_MATCH: 0.78,
	/** Cargo deduplication on ingest — kept aligned with universal threshold */
	CARGO_MERGE: 0.78,
	/**
	 * Cook deduction threshold — aligned with INGREDIENT_MATCH so that any
	 * ingredient the availability check considers a match is also eligible for
	 * deduction. Prevents "shows available, fails to cook" false positives.
	 */
	CARGO_DEDUCTION: 0.78,
} as const;

/**
 * Floors for `cargo-embedding-gemma-2` only. Initially equal to today's floors.
 * Billy's probe replaces them before the global flip. Do not copy these onto
 * `SIMILARITY_THRESHOLDS` — that would change unflagged kitchens.
 */
export const EMBEDDING_GEMMA_2_THRESHOLDS = {
	INGREDIENT_MATCH: 0.78,
	CARGO_MERGE: 0.78,
	CARGO_DEDUCTION: 0.78,
	/** Same starting point as `NAME_SEARCH_RECALL_THRESHOLD`. */
	NAME_SEARCH_RECALL: 0.6,
	/** Used when a caller omits `threshold`. Not the unflagged `0.82` literal. */
	DEFAULT_QUERY: 0.82,
} as const;

/** Recall floor on the unflagged path. Same number as name-match.ts. */
const LEGACY_RECALL_THRESHOLD = 0.6;
const LEGACY_DEFAULT_QUERY_THRESHOLD = 0.82;

export type CargoVectorFloor =
	| "ingredient"
	| "merge"
	| "deduction"
	| "recall"
	| "default";

export interface SimilarCargoMatch {
	itemId: string;
	itemName: string;
	score: number;
}

/** Max parallel Vectorize queries per batch (bounds Worker subrequests/CPU). */
export const VECTORIZE_QUERY_CONCURRENCY = 12;

type WorkersAiRun = (
	model: string,
	input: Record<string, unknown>,
) => Promise<unknown>;

type Eg2Env = Env & { VECTORIZE_EG2?: VectorizeIndex };

export type CargoVectorRun = {
	organizationId?: string;
	flagContext?: FlagshipEvaluationContext;
	/** Set when the caller already read the flag in this request. */
	gemma2?: boolean;
};

function eg2Index(env: Env): VectorizeIndex | undefined {
	return (env as Eg2Env).VECTORIZE_EG2;
}

function slicedName(text: string): string {
	return (text?.trim() || "").slice(0, 500);
}

function clusterInput(sliced: string): string {
	return `${CLUSTER_PREFIX}${sliced}`;
}

/**
 * Verified kitchen id from the server argument wins. A client-supplied
 * `organizationId` on the flag context is dropped.
 */
function flagContextForKitchen(
	organizationId: string | undefined,
	flagContext?: FlagshipEvaluationContext,
): FlagshipEvaluationContext {
	const context: FlagshipEvaluationContext = {};
	if (flagContext) {
		for (const [key, value] of Object.entries(flagContext)) {
			if (key === "organizationId") continue;
			context[key] = value;
		}
	}
	if (organizationId) context.organizationId = organizationId;
	return context;
}

function vectorErrorCode(err: unknown): number | string | undefined {
	if (!err || typeof err !== "object") return undefined;
	const record = err as Record<string, unknown>;
	if (typeof record.code === "number" || typeof record.code === "string") {
		return record.code;
	}
	const errors = record.errors;
	if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object") {
		const code = (errors[0] as { code?: unknown }).code;
		if (typeof code === "number" || typeof code === "string") return code;
	}
	return undefined;
}

function logEmbedFailure(model: string, code: number | string | undefined): void {
	log.error("[Vector] embed failed", { model, code: code ?? "unknown" });
}

async function gemma2Enabled(
	env: Env,
	organizationId: string | undefined,
	flagContext?: FlagshipEvaluationContext,
): Promise<boolean> {
	try {
		return await isFeatureEnabled(
			env,
			CARGO_EMBEDDING_FLAG,
			flagContextForKitchen(organizationId, flagContext),
		);
	} catch (err) {
		logEmbedFailure(EMBEDDING_MODEL, vectorErrorCode(err) ?? "flagship");
		return false;
	}
}

function runModel(
	ai: Ai,
	model: string,
	input: Record<string, unknown>,
): Promise<unknown> {
	return (ai.run as unknown as WorkersAiRun)(model, input);
}

function legacyVectorAt(response: unknown, index: number): number[] | null {
	const result = response as { data?: unknown };
	if (!result?.data || !Array.isArray(result.data)) return null;
	const vec = result.data[index];
	if (Array.isArray(vec) && vec.length === EMBEDDING_DIMENSIONS) return vec;
	return null;
}

function gemma2VectorAt(response: unknown, index: number): number[] | null {
	if (!response || typeof response !== "object") return null;
	const body = response as { model?: unknown; data?: unknown };
	if (body.model !== EMBEDDING_GEMMA_2_MODEL) return null;
	if (!Array.isArray(body.data)) return null;
	const row = body.data[index] as { embedding?: unknown } | undefined;
	const embedding = row?.embedding;
	if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
		return null;
	}
	if (
		!embedding.every(
			(value) => typeof value === "number" && Number.isFinite(value),
		)
	) {
		return null;
	}
	return embedding;
}

async function legacyCacheKey(sliced: string): Promise<string> {
	return EMBED_CACHE_PREFIX + (await sha256Hex(sliced));
}

async function gemma2CacheKey(sliced: string): Promise<string> {
	const hash = await sha256Hex(sliced);
	return `${EMBED_CACHE_PREFIX}${EMBEDDING_GEMMA_2_MODEL}:${EMBEDDING_DIMENSIONS}:${CLUSTER_PREFIX_VERSION}:${hash}`;
}

function floorValue(
	floor: CargoVectorFloor,
	gemma2: boolean,
): number {
	if (gemma2) {
		switch (floor) {
			case "ingredient":
				return EMBEDDING_GEMMA_2_THRESHOLDS.INGREDIENT_MATCH;
			case "merge":
				return EMBEDDING_GEMMA_2_THRESHOLDS.CARGO_MERGE;
			case "deduction":
				return EMBEDDING_GEMMA_2_THRESHOLDS.CARGO_DEDUCTION;
			case "recall":
				return EMBEDDING_GEMMA_2_THRESHOLDS.NAME_SEARCH_RECALL;
			default:
				return EMBEDDING_GEMMA_2_THRESHOLDS.DEFAULT_QUERY;
		}
	}
	switch (floor) {
		case "ingredient":
			return SIMILARITY_THRESHOLDS.INGREDIENT_MATCH;
		case "merge":
			return SIMILARITY_THRESHOLDS.CARGO_MERGE;
		case "deduction":
			return SIMILARITY_THRESHOLDS.CARGO_DEDUCTION;
		case "recall":
			return LEGACY_RECALL_THRESHOLD;
		default:
			return LEGACY_DEFAULT_QUERY_THRESHOLD;
	}
}

export async function cargoVectorFloors(
	env: Env,
	organizationId: string,
	flagContext?: FlagshipEvaluationContext,
): Promise<{
	gemma2: boolean;
	modelId: string;
	ingredient: number;
	merge: number;
	deduction: number;
	recall: number;
	defaultQuery: number;
}> {
	const gemma2 = await gemma2Enabled(env, organizationId, flagContext);
	return {
		gemma2,
		modelId: gemma2 ? EMBEDDING_GEMMA_2_MODEL : EMBEDDING_MODEL,
		ingredient: floorValue("ingredient", gemma2),
		merge: floorValue("merge", gemma2),
		deduction: floorValue("deduction", gemma2),
		recall: floorValue("recall", gemma2),
		defaultQuery: floorValue("default", gemma2),
	};
}

/** Model id for the meal-match KV key. Read at match time, not enqueue time. */
export async function cargoEmbeddingCacheToken(
	env: Env,
	organizationId: string,
	flagContext?: FlagshipEvaluationContext,
): Promise<string> {
	const gemma2 = await gemma2Enabled(env, organizationId, flagContext);
	return gemma2 ? EMBEDDING_GEMMA_2_MODEL : EMBEDDING_MODEL;
}

/** Generate embedding for a single text via Workers AI */
export async function embed(
	ai: Ai,
	text: string,
	run?: CargoVectorRun & { env?: Env },
): Promise<number[] | null> {
	if (!text?.trim()) return null;
	const gemma2 =
		run?.gemma2 ??
		(run?.env
			? await gemma2Enabled(run.env, run.organizationId, run.flagContext)
			: false);
	const sliced = slicedName(text);
	if (gemma2 && !sliced) return null;
	const model = gemma2 ? EMBEDDING_GEMMA_2_MODEL : EMBEDDING_MODEL;
	try {
		const response = gemma2
			? await runModel(ai, model, {
					input: [clusterInput(sliced)],
					dimensions: EMBEDDING_DIMENSIONS,
					encoding_format: "float",
				})
			: await runModel(ai, model, { text: [text.trim()] });
		const vec = gemma2
			? gemma2VectorAt(response, 0)
			: legacyVectorAt(response, 0);
		if (!vec) {
			if (gemma2) logEmbedFailure(model, "invalid_embedding");
			return null;
		}
		return vec;
	} catch (err) {
		logEmbedFailure(model, vectorErrorCode(err));
		return null;
	}
}

/** Generate embeddings for multiple texts, chunked to stay within the API limit */
export async function embedBatch(
	ai: Ai,
	texts: string[],
	run?: CargoVectorRun & { env?: Env },
): Promise<(number[] | null)[]> {
	if (texts.length === 0) return [];
	const gemma2 =
		run?.gemma2 ??
		(run?.env
			? await gemma2Enabled(run.env, run.organizationId, run.flagContext)
			: false);
	if (gemma2) return embedBatchGemma2(ai, texts);
	return embedBatchLegacy(ai, texts);
}

async function embedBatchLegacy(
	ai: Ai,
	texts: string[],
): Promise<(number[] | null)[]> {
	const clean = texts.map((t) => slicedName(t));
	const results: (number[] | null)[] = new Array(texts.length).fill(null);
	for (let offset = 0; offset < clean.length; offset += EMBED_BATCH_SIZE) {
		const chunk = clean.slice(offset, offset + EMBED_BATCH_SIZE);
		try {
			const response = await runModel(ai, EMBEDDING_MODEL, { text: chunk });
			for (let i = 0; i < chunk.length; i++) {
				results[offset + i] = legacyVectorAt(response, i);
			}
		} catch (err) {
			logEmbedFailure(EMBEDDING_MODEL, vectorErrorCode(err));
		}
	}
	return results;
}

async function embedBatchGemma2(
	ai: Ai,
	texts: string[],
): Promise<(number[] | null)[]> {
	const results: (number[] | null)[] = new Array(texts.length).fill(null);
	const pending: Array<{ index: number; sliced: string }> = [];
	for (let i = 0; i < texts.length; i++) {
		const sliced = slicedName(texts[i] ?? "");
		if (!sliced) continue;
		pending.push({ index: i, sliced });
	}
	for (
		let offset = 0;
		offset < pending.length;
		offset += EMBED_GEMMA_2_BATCH_SIZE
	) {
		const chunk = pending.slice(offset, offset + EMBED_GEMMA_2_BATCH_SIZE);
		try {
			const response = await runModel(ai, EMBEDDING_GEMMA_2_MODEL, {
				input: chunk.map((row) => clusterInput(row.sliced)),
				dimensions: EMBEDDING_DIMENSIONS,
				encoding_format: "float",
			});
			let rejected = false;
			for (let i = 0; i < chunk.length; i++) {
				const vec = gemma2VectorAt(response, i);
				if (!vec) rejected = true;
				results[chunk[i].index] = vec;
			}
			if (rejected) logEmbedFailure(EMBEDDING_GEMMA_2_MODEL, "invalid_embedding");
		} catch (err) {
			logEmbedFailure(EMBEDDING_GEMMA_2_MODEL, vectorErrorCode(err));
		}
	}
	return results;
}

/** Batch embed with KV cache: check cache for each, call AI only for misses */
export async function embedBatchWithCache(
	env: Env,
	texts: string[],
	run?: CargoVectorRun,
): Promise<(number[] | null)[]> {
	if (texts.length === 0) return [];
	const gemma2 = await gemma2Enabled(env, run?.organizationId, run?.flagContext);
	const order: string[] = [];
	const seen = new Set<string>();
	for (const t of texts) {
		const s = slicedName(t);
		if (!seen.has(s)) {
			seen.add(s);
			order.push(s);
		}
	}

	const cacheResults = await Promise.all(
		order.map(async (s) => {
			// Legacy still caches and embeds an empty slice. The new path does not.
			if (gemma2 && !s) return { text: s, vec: null as number[] | null };
			const key = gemma2 ? await gemma2CacheKey(s) : await legacyCacheKey(s);
			try {
				const cached = env.RATION_KV
					? await env.RATION_KV.get(key, "json")
					: null;
				if (
					cached &&
					Array.isArray(cached) &&
					cached.length === EMBEDDING_DIMENSIONS &&
					(!gemma2 ||
						cached.every(
							(value) => typeof value === "number" && Number.isFinite(value),
						))
				) {
					return { text: s, vec: cached as number[] };
				}
			} catch {
				// ignore cache read errors
			}
			return { text: s, vec: null as number[] | null };
		}),
	);

	const hits = new Map<string, number[]>();
	const toEmbed: string[] = [];
	for (const r of cacheResults) {
		if (r.vec) hits.set(r.text, r.vec);
		else if (!gemma2 || r.text) toEmbed.push(r.text);
	}

	let missVectors: (number[] | null)[] = [];
	if (toEmbed.length > 0 && env.AI) {
		missVectors = await embedBatch(env.AI, toEmbed, {
			env,
			organizationId: run?.organizationId,
			flagContext: run?.flagContext,
			gemma2,
		});
		if (env.RATION_KV) {
			for (let i = 0; i < toEmbed.length; i++) {
				const vec = missVectors[i];
				if (vec && vec.length === EMBEDDING_DIMENSIONS) {
					const key = gemma2
						? await gemma2CacheKey(toEmbed[i])
						: await legacyCacheKey(toEmbed[i]);
					env.RATION_KV.put(key, JSON.stringify(vec), {
						expirationTtl: EMBED_CACHE_TTL,
					}).catch(() => {});
				}
			}
		}
	}

	const vecByText = new Map<string, number[] | null>();
	for (const s of order) {
		vecByText.set(s, hits.get(s) ?? null);
	}
	for (let i = 0; i < toEmbed.length; i++) {
		vecByText.set(toEmbed[i], missVectors[i] ?? null);
	}

	return texts.map((t) => vecByText.get(slicedName(t)) ?? null);
}

type CargoVectorItem = { id: string; name: string; domain: string };

async function upsertInto(
	index: VectorizeIndex,
	organizationId: string,
	rows: Array<{ id: string; values: number[]; name: string; domain: string }>,
	logLabel: string,
	model: string,
): Promise<void> {
	if (rows.length === 0) return;
	const toUpsert = rows.map((row) => ({
		id: row.id,
		values: row.values,
		namespace: organizationId,
		metadata: {
			name: row.name,
			domain: row.domain ?? "food",
			organizationId,
		},
	}));
	for (const chunk of chunkArray(toUpsert, VECTORIZE_UPSERT_MAX)) {
		try {
			await index.upsert(chunk);
		} catch (err) {
			log.error(logLabel, {
				model,
				code: vectorErrorCode(err) ?? "upsert",
			});
		}
	}
}

/** Upsert a single cargo item's vector into Vectorize */
export async function upsertCargoVector(
	env: Env,
	organizationId: string,
	item: CargoVectorItem,
	flagContext?: FlagshipEvaluationContext,
): Promise<void> {
	if (!env.AI) return;
	const gemma2 = await gemma2Enabled(env, organizationId, flagContext);
	const index = gemma2 ? eg2Index(env) : env.VECTORIZE;
	if (!index) return;
	const model = gemma2 ? EMBEDDING_GEMMA_2_MODEL : EMBEDDING_MODEL;
	const vec = await embed(env.AI, item.name, {
		env,
		organizationId,
		flagContext,
		gemma2,
	});
	if (!vec || vec.length !== EMBEDDING_DIMENSIONS) return;
	await upsertInto(
		index,
		organizationId,
		[
			{
				id: item.id,
				values: vec,
				name: item.name,
				domain: item.domain ?? "food",
			},
		],
		"[Vector] upsertCargoVector failed",
		model,
	);
}

/** Upsert multiple cargo items' vectors in batch */
export async function upsertCargoVectors(
	env: Env,
	organizationId: string,
	items: CargoVectorItem[],
	flagContext?: FlagshipEvaluationContext,
): Promise<void> {
	if (!env.AI || items.length === 0) return;
	const gemma2 = await gemma2Enabled(env, organizationId, flagContext);
	const index = gemma2 ? eg2Index(env) : env.VECTORIZE;
	if (!index) return;
	const model = gemma2 ? EMBEDDING_GEMMA_2_MODEL : EMBEDDING_MODEL;
	const vectors = await embedBatch(
		env.AI,
		items.map((item) => item.name),
		{ env, organizationId, flagContext, gemma2 },
	);
	const rows: Array<{
		id: string;
		values: number[];
		name: string;
		domain: string;
	}> = [];
	for (let i = 0; i < items.length; i++) {
		const vec = vectors[i];
		if (vec && vec.length === EMBEDDING_DIMENSIONS) {
			rows.push({
				id: items[i].id,
				values: vec,
				name: items[i].name,
				domain: items[i].domain ?? "food",
			});
		}
	}
	await upsertInto(
		index,
		organizationId,
		rows,
		"[Vector] upsertCargoVectors chunk failed",
		model,
	);
}

function idsFromGetByIds(result: unknown): Set<string> {
	const rows = Array.isArray(result)
		? result
		: result &&
				typeof result === "object" &&
				Array.isArray((result as { vectors?: unknown }).vectors)
			? (result as { vectors: unknown[] }).vectors
			: [];
	const ids = new Set<string>();
	for (const row of rows) {
		if (
			row &&
			typeof row === "object" &&
			typeof (row as { id?: unknown }).id === "string"
		) {
			ids.add((row as { id: string }).id);
		}
	}
	return ids;
}

/**
 * Lazy-fill resolved Cargo rows missing from the new index.
 * No-op when the flag is off. Never upserts a free-text query. Never throws.
 */
export async function fillMissingCargoVectors(
	env: Env,
	organizationId: string,
	items: CargoVectorItem[],
	flagContext?: FlagshipEvaluationContext,
): Promise<void> {
	if (items.length === 0) return;
	let gemma2 = false;
	try {
		gemma2 = await gemma2Enabled(env, organizationId, flagContext);
	} catch (err) {
		logEmbedFailure(EMBEDDING_GEMMA_2_MODEL, vectorErrorCode(err) ?? "flagship");
		return;
	}
	if (!gemma2) return;
	const index = eg2Index(env);
	if (!index || !env.AI) {
		logEmbedFailure(EMBEDDING_GEMMA_2_MODEL, "binding_missing");
		return;
	}

	const byId = new Map<string, CargoVectorItem>();
	for (const item of items) {
		if (!item.id || !item.name?.trim()) continue;
		if (!byId.has(item.id)) byId.set(item.id, item);
	}
	const ids = [...byId.keys()];
	if (ids.length === 0) return;

	const present = new Set<string>();
	try {
		for (const chunk of chunkArray(ids, VECTORIZE_DELETE_BY_IDS_MAX)) {
			const found = await index.getByIds(chunk);
			for (const id of idsFromGetByIds(found)) present.add(id);
		}
	} catch (err) {
		log.error("[Vector] lazy fill skipped", {
			model: EMBEDDING_GEMMA_2_MODEL,
			code: vectorErrorCode(err) ?? "getByIds",
		});
		return;
	}

	const missing = ids
		.filter((id) => !present.has(id))
		.map((id) => byId.get(id))
		.filter((item): item is CargoVectorItem => item != null);
	if (missing.length === 0) return;
	try {
		await upsertCargoVectors(env, organizationId, missing, flagContext);
	} catch (err) {
		log.error("[Vector] lazy fill skipped", {
			model: EMBEDDING_GEMMA_2_MODEL,
			code: vectorErrorCode(err) ?? "upsert",
		});
	}
}

/** Delete cargo vectors by ID. Throws on Vectorize failure (GDPR fail-closed). */
export async function deleteCargoVectors(
	env: Env,
	itemIds: string[],
): Promise<void> {
	if (itemIds.length === 0) return;
	const indexes = [env.VECTORIZE, eg2Index(env)].filter(
		(index): index is VectorizeIndex => Boolean(index),
	);
	if (indexes.length === 0) return;
	const failures: unknown[] = [];
	for (const index of indexes) {
		for (const chunk of chunkArray(itemIds, VECTORIZE_DELETE_BY_IDS_MAX)) {
			try {
				await index.deleteByIds(chunk);
			} catch (err) {
				failures.push(err);
			}
		}
	}
	if (failures.length > 0) {
		throw failures[0];
	}
}

/** Batch query for multiple ingredient names (uses KV cache for embeddings) */
export async function findSimilarCargoBatch(
	env: Env,
	organizationId: string,
	ingredientNames: string[],
	options?: {
		topK?: number;
		threshold?: number;
		domain?: string;
		floor?: CargoVectorFloor;
		flagContext?: FlagshipEvaluationContext;
	},
): Promise<Map<string, SimilarCargoMatch[]>> {
	const out = new Map<string, SimilarCargoMatch[]>();
	if (ingredientNames.length === 0) return out;
	const gemma2 = await gemma2Enabled(
		env,
		organizationId,
		options?.flagContext,
	);
	const { topK = 3 } = options ?? {};
	const threshold =
		options?.floor != null
			? floorValue(options.floor, gemma2)
			: (options?.threshold ??
				(gemma2
					? EMBEDDING_GEMMA_2_THRESHOLDS.DEFAULT_QUERY
					: LEGACY_DEFAULT_QUERY_THRESHOLD));
	const index = gemma2 ? eg2Index(env) : env.VECTORIZE;
	const vectors = await embedBatchWithCache(env, ingredientNames, {
		organizationId,
		flagContext: options?.flagContext,
	});
	if (!index) return out;
	const queryOpts = {
		topK,
		returnMetadata: "indexed" as const,
		namespace: organizationId,
	};

	const indexed = ingredientNames.map((name, i) => ({ name, i }));
	for (const chunk of chunkArray(indexed, VECTORIZE_QUERY_CONCURRENCY)) {
		await Promise.all(
			chunk.map(async ({ name, i }) => {
				const vec = vectors[i];
				if (!vec || vec.length !== EMBEDDING_DIMENSIONS) return;
				try {
					const result = await index.query(vec, queryOpts);
					const matches =
						(
							result as {
								matches?: Array<{
									id?: string;
									score?: number;
									metadata?: Record<string, string>;
								}>;
							}
						).matches ?? [];
					const filtered = matches
						.filter((m) => m.score != null && m.score >= threshold)
						.map((m) => ({
							itemId: m.id ?? "",
							itemName: ((m.metadata?.name ?? "").trim() || m.id) ?? "",
							score: m.score ?? 0,
						}))
						.filter((m) => m.itemId && m.itemName);
					out.set(name, filtered);
				} catch {
					out.set(name, []);
				}
			}),
		);
	}
	return out;
}
