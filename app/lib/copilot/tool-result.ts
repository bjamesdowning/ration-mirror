/**
 * Detect structured tool failures returned by `toAiSdkTools` instead of thrown
 * errors. Clients must treat these as unsuccessful tool completions for UI
 * labels even though the AI SDK emits `tool-output-available`.
 */
export function isStructuredCopilotToolFailure(output: unknown): boolean {
	if (!output || typeof output !== "object") return false;
	const record = output as Record<string, unknown>;
	if (record.ok !== false) return false;
	const error = record.error;
	if (!error || typeof error !== "object") return false;
	const body = error as Record<string, unknown>;
	return typeof body.code === "string" && typeof body.message === "string";
}
