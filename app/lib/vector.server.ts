/**
 * Vectorize service for semantic cargo-to-galley ingredient matching.
 * Uses Cloudflare Workers AI (bge-base-en-v1.5) for embeddings and Vectorize for storage.
 */

import { log } from "./logging.server";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBED_CACHE_TTL = 60 * 60 * 24 * 7; // 7 days
const EMBED_CACHE_PREFIX = "vec:";

/** Similarity thresholds per context */
export const SIMILARITY_THRESHOLDS = {
	MEAL_MATCH: 0.82,
	SUPPLY_MATCH: 0.84,
	GENERATION_VERIFY: 0.82,
	CARGO_DEDUCTION: 0.85,
	CARGO_MERGE: 0.78,
} as const;

function sha256(text: string): string {
	// Simple hash for cache key - Cloudflare Workers support crypto.subtle
	// We use a deterministic string hash for cache keys (non-crypto use)
	let h = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		h = (h << 5) - h + c;
		h = h & h;
	}
	return Math.abs(h).toString(36);
}

/** Generate embedding for a single text via Workers AI */
export async function embed(ai: Ai, text: string): Promise<number[] | null> {
	if (!text?.trim()) return null;
	try {
		const response = await ai.run(EMBEDDING_MODEL, {
			text: [text.trim()],
		});
		// Workers AI returns { shape, data: number[][] } — one array per input text
		const result = response as {
			shape?: number[];
			data?: number[][];
		};
		if (!result?.data || !Array.isArray(result.data)) return null;
		const vec = result.data[0];
		if (Array.isArray(vec) && vec.length === 768) return vec;
		return null;
	} catch (err) {
		log.error("[Vector] embed failed:", err);
		return null;
	}
}

// bge-base-en-v1.5 supports up to 100 inputs per request
const EMBED_BATCH_SIZE = 100;

/** Generate embeddings for multiple texts, chunked to stay within the API limit */
export async function embedBatch(
	ai: Ai,
	texts: string[],
): Promise<(number[] | null)[]> {
	if (texts.length === 0) return [];
	const clean = texts.map((t) => (t?.trim() || "").slice(0, 500));
	const results: (number[] | null)[] = new Array(texts.length).fill(null);

	for (let offset = 0; offset < clean.length; offset += EMBED_BATCH_SIZE) {
		const chunk = clean.slice(offset, offset + EMBED_BATCH_SIZE);
		try {
			const response = await ai.run(EMBEDDING_MODEL, { text: chunk });
			// Workers AI returns { shape, data: number[][] } — one array per input text
			const result = response as {
				shape?: number[];
				data?: number[][];
			};
			if (result?.data && Array.isArray(result.data)) {
				for (let i = 0; i < chunk.length; i++) {
					const vec = result.data[i];
					results[offset + i] =
						Array.isArray(vec) && vec.length === 768 ? vec : null;
				}
			}
		} catch (err) {
			log.error("[Vector] embedBatch chunk failed:", err);
		}
	}
	return results;
}

/** Batch embed with KV cache: check cache for each, call AI only for misses */
export async function embedBatchWithCache(
	env: Env,
	texts: string[],
): Promise<(number[] | null)[]> {
	if (texts.length === 0) return [];
	const order: string[] = [];
	const seen = new Set<string>();
	for (const t of texts) {
		const s = (t?.trim() || "").slice(0, 500);
		if (!seen.has(s)) {
			seen.add(s);
			order.push(s);
		}
	}

	const cacheResults = await Promise.all(
		order.map(async (s) => {
			const key = EMBED_CACHE_PREFIX + sha256(s);
			try {
				const cached = env.RATION_KV
					? await env.RATION_KV.get(key, "json")
					: null;
				if (cached && Array.isArray(cached) && cached.length === 768) {
					return { text: s, vec: cached as number[] };
				}
			} catch {
				// Cache read failed
			}
			return { text: s, vec: null as number[] | null };
		}),
	);

	const hits = new Map<string, number[]>();
	const toEmbed: string[] = [];
	for (const r of cacheResults) {
		if (r.vec) {
			hits.set(r.text, r.vec);
		} else {
			toEmbed.push(r.text);
		}
	}

	let missVectors: (number[] | null)[] = [];
	if (toEmbed.length > 0 && env.AI) {
		missVectors = await embedBatch(env.AI, toEmbed);
		if (env.RATION_KV) {
			for (let i = 0; i < toEmbed.length; i++) {
				const vec = missVectors[i];
				if (vec && vec.length === 768) {
					const key = EMBED_CACHE_PREFIX + sha256(toEmbed[i]);
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

	return texts.map((t) => {
		const s = (t?.trim() || "").slice(0, 500);
		return vecByText.get(s) ?? null;
	});
}

/** Embed with optional KV cache lookup */
export async function embedWithCache(
	env: Env,
	text: string,
): Promise<number[] | null> {
	const key = EMBED_CACHE_PREFIX + sha256(text);
	try {
		const cached = await env.RATION_KV.get(key, "json");
		if (cached && Array.isArray(cached) && cached.length === 768) {
			return cached as number[];
		}
	} catch {
		// Cache read failed, proceed to embed
	}
	const vec = await embed(env.AI, text);
	if (vec && env.RATION_KV) {
		env.RATION_KV.put(key, JSON.stringify(vec), {
			expirationTtl: EMBED_CACHE_TTL,
		}).catch(() => {});
	}
	return vec;
}

/** Upsert a single cargo item's vector into Vectorize */
export async function upsertCargoVector(
	env: Env,
	organizationId: string,
	item: { id: string; name: string; domain: string },
): Promise<void> {
	if (!env.VECTORIZE || !env.AI) return;
	const vec = await embed(env.AI, item.name);
	if (!vec || vec.length !== 768) return;
	try {
		await env.VECTORIZE.upsert([
			{
				id: item.id,
				values: vec,
				namespace: organizationId,
				metadata: {
					name: item.name,
					domain: item.domain ?? "food",
					organizationId,
				},
			},
		]);
	} catch (err) {
		log.error("[Vector] upsertCargoVector failed:", err);
	}
}

/** Upsert multiple cargo items' vectors in batch */
export async function upsertCargoVectors(
	env: Env,
	organizationId: string,
	items: Array<{ id: string; name: string; domain: string }>,
): Promise<void> {
	if (!env.VECTORIZE || !env.AI || items.length === 0) return;
	const names = items.map((i) => i.name);
	const vectors = await embedBatch(env.AI, names);
	const toUpsert: {
		id: string;
		values: number[];
		namespace: string;
		metadata: Record<string, string>;
	}[] = [];
	for (let i = 0; i < items.length; i++) {
		const vec = vectors[i];
		if (vec && vec.length === 768) {
			toUpsert.push({
				id: items[i].id,
				values: vec,
				namespace: organizationId,
				metadata: {
					name: items[i].name,
					domain: items[i].domain ?? "food",
					organizationId,
				},
			});
		}
	}
	if (toUpsert.length === 0) return;
	for (let i = 0; i < toUpsert.length; i += 1000) {
		const chunk = toUpsert.slice(i, i + 1000);
		try {
			await env.VECTORIZE.upsert(chunk);
		} catch (err) {
			log.error("[Vector] upsertCargoVectors chunk failed:", err);
		}
	}
}

/** Delete cargo vectors by ID */
export async function deleteCargoVectors(
	env: Env,
	itemIds: string[],
): Promise<void> {
	if (!env.VECTORIZE || itemIds.length === 0) return;
	try {
		await env.VECTORIZE.deleteByIds(itemIds);
	} catch (err) {
		log.error("[Vector] deleteCargoVectors failed:", err);
	}
}

export interface SimilarCargoMatch {
	itemId: string;
	itemName: string;
	score: number;
}

/** Query Vectorize for similar cargo items */
export async function findSimilarCargo(
	env: Env,
	organizationId: string,
	ingredientName: string,
	options?: {
		topK?: number;
		threshold?: number;
		domain?: string;
	},
): Promise<SimilarCargoMatch[]> {
	if (!env.VECTORIZE || !env.AI) return [];
	const { topK = 3, threshold = 0.82 } = options ?? {};
	const vec = await embedWithCache(env, ingredientName);
	if (!vec || vec.length !== 768) return [];
	try {
		const queryOpts = {
			topK,
			returnMetadata: "indexed" as const,
			namespace: organizationId,
		};
		const result = await env.VECTORIZE.query(vec, queryOpts);
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
		return matches
			.filter((m) => m.score != null && m.score >= threshold)
			.map((m) => ({
				itemId: m.id ?? "",
				itemName: ((m.metadata?.name ?? "").trim() || m.id) ?? "",
				score: m.score ?? 0,
			}))
			.filter((m) => m.itemId && m.itemName);
	} catch (err) {
		log.error("[Vector] findSimilarCargo failed:", err);
		return [];
	}
}

/** Batch query for multiple ingredient names (uses KV cache for embeddings) */
export async function findSimilarCargoBatch(
	env: Env,
	organizationId: string,
	ingredientNames: string[],
	options?: { topK?: number; threshold?: number; domain?: string },
): Promise<Map<string, SimilarCargoMatch[]>> {
	const out = new Map<string, SimilarCargoMatch[]>();
	if (ingredientNames.length === 0) return out;
	const { topK = 3, threshold = 0.82 } = options ?? {};
	const vectors = await embedBatchWithCache(env, ingredientNames);
	if (!env.VECTORIZE) return out;
	const queryOpts = {
		topK,
		returnMetadata: "indexed" as const,
		namespace: organizationId,
	};
	await Promise.all(
		ingredientNames.map(async (name, i) => {
			const vec = vectors[i];
			if (!vec || vec.length !== 768) return;
			try {
				const result = await env.VECTORIZE.query(vec, queryOpts);
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
	return out;
}
