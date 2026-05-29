/**
 * Normalizes OAuth consent scope values from D1 / Better Auth into a string array.
 * Scopes may be stored as a JSON array, a JSON-encoded string, or a space-separated string.
 */
export function normalizeOAuthScopes(scopes: unknown): string[] {
	if (scopes == null) {
		return [];
	}

	if (Array.isArray(scopes)) {
		return scopes.flatMap((entry) => normalizeOAuthScopes(entry));
	}

	if (typeof scopes !== "string") {
		return [];
	}

	const trimmed = scopes.trim();
	if (!trimmed) {
		return [];
	}

	if (trimmed.startsWith("[")) {
		try {
			return normalizeOAuthScopes(JSON.parse(trimmed) as unknown);
		} catch {
			return [];
		}
	}

	return trimmed.split(/\s+/).filter(Boolean);
}

/** Comma-separated display for UI (never throws). */
export function formatOAuthScopesDisplay(scopes: unknown): string {
	const normalized = normalizeOAuthScopes(scopes);
	return normalized.length > 0 ? normalized.join(", ") : "—";
}
