import { projectToolResult } from "../mcp/response-profile";

/**
 * Card projection for a Copilot presenter. Do not attach this to the model
 * tool message — `runTool` already returns the agent profile.
 */
export function presentCopilotCard(input: {
	tool: string;
	data: unknown;
	meta?: Parameters<typeof projectToolResult>[0]["meta"];
	args?: Record<string, unknown>;
	warnings?: string[];
}) {
	return projectToolResult({ ...input, profile: "card" });
}

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
