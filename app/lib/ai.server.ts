/**
 * Extracts the text content from a Google AI (Gemini) API response payload.
 * Works for both the AI Gateway (google-ai-studio) and direct Google AI responses.
 */
export function extractModelText(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const candidates = (payload as { candidates?: Array<unknown> }).candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) return null;
	const first = candidates[0] as {
		content?: { parts?: Array<{ text?: string }> };
	};
	const parts = first?.content?.parts;
	if (!Array.isArray(parts)) return null;
	for (const part of parts) {
		if (typeof part.text === "string") {
			return part.text;
		}
	}
	return null;
}
