/**
 * Client-side helpers for progressive nutrition resolve on scan / dock review.
 * Chunks stay within API max (50 names) and paint kcal as each batch returns.
 */

export const NUTRITION_RESOLVE_API_MAX_NAMES = 50;
/** Smaller than API max so large receipts fill kcal progressively. */
export const NUTRITION_RESOLVE_CLIENT_CHUNK = 10;

export type NutritionLookupStatus = "idle" | "loading" | "done" | "failed";

/**
 * After a scan/dock review rename, re-resolve unless the user already set an override.
 */
export function shouldReresolveNutritionAfterNameChange(options: {
	previousName: string;
	nextName: string;
	nutritionSource?: string | null;
}): boolean {
	const previous = options.previousName.trim();
	const next = options.nextName.trim();
	if (!next || previous === next) return false;
	if (options.nutritionSource === "user_override") return false;
	return true;
}

export function uniqueTrimmedNames(names: Iterable<string>): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of names) {
		const name = raw.trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		out.push(name);
	}
	return out;
}

export function chunkNamesForResolve(
	names: string[],
	chunkSize: number = NUTRITION_RESOLVE_CLIENT_CHUNK,
): string[][] {
	const size = Math.min(
		Math.max(1, chunkSize),
		NUTRITION_RESOLVE_API_MAX_NAMES,
	);
	const chunks: string[][] = [];
	for (let i = 0; i < names.length; i += size) {
		chunks.push(names.slice(i, i + size));
	}
	return chunks;
}

export type ResolveNutritionChunkResult = {
	snapshots: Record<string, unknown | null>;
	ok: boolean;
};

/**
 * Resolve names in sequential chunks. Calls `onChunk` after each successful batch
 * so the UI can attach kcal progressively. Soft-fails per chunk; overall status is
 * `failed` only when every chunk fails (or the first fails and none succeed).
 */
export async function resolveNutritionInChunks(options: {
	names: string[];
	ingestSource?: "scan_review";
	signal?: AbortSignal;
	chunkSize?: number;
	fetchChunk: (
		chunk: string[],
		signal: AbortSignal | undefined,
	) => Promise<ResolveNutritionChunkResult>;
	onChunk: (snapshots: Record<string, unknown | null>) => void;
}): Promise<NutritionLookupStatus> {
	const unique = uniqueTrimmedNames(options.names);
	if (unique.length === 0) return "done";

	const chunks = chunkNamesForResolve(unique, options.chunkSize);
	let anyOk = false;
	let anyAttempted = false;

	for (const chunk of chunks) {
		if (options.signal?.aborted) return "failed";
		anyAttempted = true;
		try {
			const result = await options.fetchChunk(chunk, options.signal);
			if (options.signal?.aborted) return "failed";
			if (!result.ok) continue;
			anyOk = true;
			options.onChunk(result.snapshots);
		} catch {
			// Soft-fail this chunk; continue remaining batches.
		}
	}

	if (!anyAttempted) return "done";
	return anyOk ? "done" : "failed";
}

/** Browser fetch wrapper for POST /api/nutrition/resolve. */
export async function fetchNutritionResolveChunk(
	chunk: string[],
	options: {
		ingestSource?: "scan_review";
		signal?: AbortSignal;
	} = {},
): Promise<ResolveNutritionChunkResult> {
	const response = await fetch("/api/nutrition/resolve", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		signal: options.signal,
		body: JSON.stringify({
			names: chunk,
			...(options.ingestSource ? { ingestSource: options.ingestSource } : {}),
		}),
	});
	if (!response.ok) {
		return { ok: false, snapshots: {} };
	}
	const body = (await response.json()) as {
		snapshots?: Record<string, unknown | null>;
	};
	return { ok: true, snapshots: body.snapshots ?? {} };
}
