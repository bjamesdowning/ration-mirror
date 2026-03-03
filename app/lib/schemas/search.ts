import { z } from "zod";

/**
 * Search query validation for /api/search.
 * Enforces length limits and prevents unbounded input that could cause
 * performance issues or DoS via crafted LIKE patterns.
 * Trims first so whitespace-only strings are rejected.
 */
export const SearchQuerySchema = z
	.string()
	.trim()
	.pipe(z.string().min(2).max(256));

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
