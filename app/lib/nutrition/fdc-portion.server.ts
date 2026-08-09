/**
 * FDC portion lookup stub (Slice 5).
 * Full D1 portion table wiring lands with USDA portion import.
 */

export type FdcPortionRow = {
	fdcId: number;
	portionDescription: string;
	gramWeight: number;
};

export type FdcPortionLookupResult = {
	portion: FdcPortionRow | null;
	fromCache: boolean;
};

/**
 * Resolve a USDA portion by FDC id + optional description hint.
 * Returns null until portion tables are populated.
 */
export async function lookupFdcPortion(
	_env: Env,
	_fdcId: number,
	_portionDescription?: string | null,
): Promise<FdcPortionLookupResult> {
	return { portion: null, fromCache: false };
}

/** KV cache key shape for portion lookups (versioned with matcher). */
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
