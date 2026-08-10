/**
 * Extracts the text content from a Google AI (Gemini) API response payload.
 * Works for both the AI Gateway (google-ai-studio) and direct Google AI responses.
 *
 * Concatenates all text parts — some models emit multiple parts even when
 * `includeThoughts` is false; taking only the first part can drop the JSON.
 */
export function extractModelText(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const candidates = (payload as { candidates?: Array<unknown> }).candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) return null;
	const first = candidates[0] as {
		content?: { parts?: Array<{ text?: string }> };
		finishReason?: string;
	};
	const parts = first?.content?.parts;
	if (!Array.isArray(parts)) return null;
	const texts: string[] = [];
	for (const part of parts) {
		if (typeof part?.text === "string" && part.text.length > 0) {
			texts.push(part.text);
		}
	}
	if (texts.length === 0) return null;
	return texts.join("\n");
}

/** Gemini finishReason when present on the first candidate (best-effort). */
export function extractFinishReason(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const candidates = (payload as { candidates?: Array<unknown> }).candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) return null;
	const first = candidates[0] as { finishReason?: string };
	return typeof first?.finishReason === "string" ? first.finishReason : null;
}
