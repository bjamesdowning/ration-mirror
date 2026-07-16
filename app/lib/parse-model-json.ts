/**
 * Parse JSON from LLM text that may include markdown fences or leading/trailing prose.
 * Returns null on failure — never throws.
 */

export function stripMarkdownJsonFences(text: string): string {
	return text
		.replace(/^```(?:json)?\s*\n?/i, "")
		.replace(/\n?```\s*$/i, "")
		.trim();
}

/**
 * Extract the first balanced `{...}` or `[...]` value, respecting JSON string escapes.
 */
export function extractFirstJsonValue(text: string): string | null {
	const start = text.search(/[{[]/);
	if (start < 0) return null;

	const open = text[start];
	const close = open === "{" ? "}" : "]";
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === open) depth++;
		else if (ch === close) {
			depth--;
			if (depth === 0) {
				return text.slice(start, i + 1);
			}
		}
	}
	return null;
}

/** Light repair: trailing commas before } or ] (common LLM slip). */
export function repairTrailingCommas(jsonText: string): string {
	return jsonText.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Best-effort parse of model output into a JSON value.
 * Tries fence-stripped text, extracted balanced JSON, and trailing-comma repair.
 */
export function parseModelJson(text: string): unknown | null {
	if (!text?.trim()) return null;

	const cleaned = stripMarkdownJsonFences(text);
	const extracted = extractFirstJsonValue(cleaned);
	const candidates = Array.from(
		new Set([cleaned, extracted].filter((c): c is string => Boolean(c))),
	);

	for (const candidate of candidates) {
		for (const variant of [candidate, repairTrailingCommas(candidate)]) {
			try {
				return JSON.parse(variant) as unknown;
			} catch {
				// try next variant
			}
		}
	}
	return null;
}
