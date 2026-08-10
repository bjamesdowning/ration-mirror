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

export function repairTrailingCommas(jsonText: string): string {
	return jsonText.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Remove glitched empty/orphan objects Gemini sometimes inserts mid-array, e.g.
 * `...0.9},{"},{"name":"chickpeas"...` → drop `,{"}`.
 */
export function repairGlitchedArrayObjects(jsonText: string): string {
	return jsonText
		.replace(/,\s*\{\s*"?\s*\}\s*(?=,|])/g, "")
		.replace(/\[\s*\{\s*"?\s*\}\s*,/g, "[");
}

/** Normalize curly/smart quotes that LLMs sometimes emit inside JSON. */
export function normalizeJsonQuotes(text: string): string {
	return text
		.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
		.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

/**
 * Last-resort: pull balanced `{...}` objects that look like scan items and
 * rebuild `{"items":[...]}`. Skips glitched fragments like `{"}`.
 */
export function reconstructItemsArrayFromObjects(text: string): string | null {
	const items: string[] = [];
	let i = 0;
	while (i < text.length) {
		if (text[i] !== "{") {
			i++;
			continue;
		}
		let depth = 0;
		let inString = false;
		let escaped = false;
		let end = -1;
		for (let j = i; j < text.length; j++) {
			const ch = text[j];
			if (inString) {
				if (escaped) escaped = false;
				else if (ch === "\\") escaped = true;
				else if (ch === '"') inString = false;
				continue;
			}
			if (ch === '"') {
				inString = true;
				continue;
			}
			if (ch === "{") depth++;
			else if (ch === "}") {
				depth--;
				if (depth === 0) {
					end = j;
					break;
				}
			}
		}
		if (end < 0) break;
		const slice = text.slice(i, end + 1);
		i = end + 1;
		if (!/"name"\s*:/.test(slice)) continue;
		try {
			JSON.parse(slice);
			items.push(slice);
		} catch {
			// skip invalid object
		}
	}
	if (items.length === 0) return null;
	return `{"items":[${items.join(",")}]}`;
}

/**
 * Safe, PII-light diagnostics when model text fails JSON parse.
 * Does not log receipt content — only shape signals.
 */
export function describeUnparseableModelText(text: string): {
	textLength: number;
	startsWithBrace: boolean;
	startsWithFence: boolean;
	hasItemsKey: boolean;
	looksTruncated: boolean;
	hasGlitchedArrayObject: boolean;
} {
	const trimmed = text.trim();
	return {
		textLength: text.length,
		startsWithBrace: trimmed.startsWith("{"),
		startsWithFence: trimmed.startsWith("```"),
		hasItemsKey: /"items"\s*:/.test(trimmed),
		looksTruncated:
			trimmed.length > 0 &&
			!trimmed.endsWith("}") &&
			!trimmed.endsWith("]") &&
			!trimmed.endsWith("```"),
		hasGlitchedArrayObject: /,\s*\{\s*"?\s*\}\s*,/.test(trimmed),
	};
}

function parseVariants(candidate: string): unknown | null {
	const variants = [
		candidate,
		repairTrailingCommas(candidate),
		repairGlitchedArrayObjects(candidate),
		repairTrailingCommas(repairGlitchedArrayObjects(candidate)),
	];
	for (const variant of variants) {
		try {
			return JSON.parse(variant) as unknown;
		} catch {
			// try next
		}
	}
	return null;
}

/**
 * Best-effort parse of model output into a JSON value.
 * Tries fence-stripped text, extracted balanced JSON, glitch repair, and
 * item-object reconstruction.
 */
export function parseModelJson(text: string): unknown | null {
	if (!text?.trim()) return null;

	const cleaned = normalizeJsonQuotes(stripMarkdownJsonFences(text));
	const extracted = extractFirstJsonValue(cleaned);
	const candidates = Array.from(
		new Set([cleaned, extracted].filter((c): c is string => Boolean(c))),
	);

	for (const candidate of candidates) {
		const parsed = parseVariants(candidate);
		if (parsed != null) return parsed;
	}

	const rebuilt = reconstructItemsArrayFromObjects(cleaned);
	if (rebuilt) {
		try {
			return JSON.parse(rebuilt) as unknown;
		} catch {
			return null;
		}
	}
	return null;
}
