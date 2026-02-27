/**
 * Canonical type for a single cooking step.
 * Subset of Schema.org HowToStep — forward-compatible with future additions
 * (timerSeconds, imageUrl) without a DB migration.
 */
export type RecipeStep = {
	/** 1-indexed sequential position within the recipe */
	position: number;
	/** Full plain-text instruction */
	text: string;
	/** Optional section heading rendered as a divider above the first step in the section */
	section?: string;
};

/**
 * Accepts any shape directions might arrive in and returns a normalized
 * RecipeStep[]. Covers all ingestion paths:
 *
 *   - string[]       — AI generation output
 *   - RecipeStep[]   — already canonical (re-indexes positions)
 *   - string         — URL import newline-joined text, or manual textarea
 *   - null/undefined — returns []
 */
export function normalizeDirections(raw: unknown): RecipeStep[] {
	if (raw == null) return [];

	if (Array.isArray(raw)) {
		if (raw.length === 0) return [];

		// Already canonical RecipeStep[]
		if (typeof raw[0] === "object" && raw[0] !== null && "text" in raw[0]) {
			return (raw as RecipeStep[])
				.filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
				.map((s, i) => ({
					position: i + 1,
					text: s.text.trim(),
					...(s.section ? { section: s.section.trim() } : {}),
				}));
		}

		// string[] from AI
		return (raw as unknown[])
			.map((s) => String(s).trim())
			.map((s) => s.replace(/^\d+[.)]\s*/, ""))
			.filter((s) => s.length > 0)
			.map((text, i) => ({ position: i + 1, text }));
	}

	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (trimmed.length === 0) return [];
		return trimmed
			.split(/\n+/)
			.map((line) => line.trim())
			.map((line) => line.replace(/^\d+[.)]\s*/, ""))
			.filter((line) => line.length > 0)
			.map((text, i) => ({ position: i + 1, text }));
	}

	return [];
}

/**
 * Read path: handles both the new JSON format and legacy newline-joined strings
 * stored in existing rows. Always returns RecipeStep[].
 */
export function parseDirections(
	raw: string | RecipeStep[] | null | undefined,
): RecipeStep[] {
	if (raw == null) return [];

	// Drizzle JSON mode may already deserialize to an array
	if (Array.isArray(raw)) return normalizeDirections(raw);

	const trimmed = (raw as string).trim();
	if (trimmed.length === 0) return [];

	// Try JSON first (new format written by this system)
	if (trimmed.startsWith("[")) {
		try {
			const parsed = JSON.parse(trimmed);
			return normalizeDirections(parsed);
		} catch {
			// Fall through to plain-text handling
		}
	}

	return normalizeDirections(trimmed);
}

/** Serializes steps for storage in the D1 TEXT column. */
export function serializeDirections(steps: RecipeStep[]): string {
	return JSON.stringify(steps);
}
