/**
 * Pure helpers for detecting when Copilot finishes an actionable turn
 * without calling any tools (native-feature deflection failure mode).
 */

const ACTION_VERB_PATTERN =
	/\b(create|add|plan|fill|schedule|import|generate|make|build|remove|delete|update|set|sync|mark|consume)\b/i;

const WRITE_TOOL_PREFIXES = [
	"add_",
	"update_",
	"adjust_",
	"remove_",
	"apply_",
	"preview_",
	"import_",
	"create_",
	"delete_",
	"set_",
	"clear_",
	"consume_",
	"propose_",
	"commit_",
	"mark_",
	"sync_",
	"complete_",
	"start_",
] as const;

export function hasWriteTools(activeTools: string[]): boolean {
	return activeTools.some((name) =>
		WRITE_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix)),
	);
}

export function isActionableUserText(userText: string): boolean {
	return ACTION_VERB_PATTERN.test(userText.trim());
}

export type CopilotDeflectionInput = {
	toolCallCount: number;
	activeTools: string[];
	userText: string;
	/** True when detectNativeFeatureSuggestion matched this turn. */
	nativeSuggestionMatched: boolean;
};

/**
 * True when the model ended a turn that clearly needed kitchen mutations
 * without calling any tools.
 */
export function detectCopilotDeflection(
	input: CopilotDeflectionInput,
): boolean {
	if (input.toolCallCount > 0) return false;
	if (!hasWriteTools(input.activeTools)) return false;
	const text = input.userText.trim();
	if (!text) return false;
	return input.nativeSuggestionMatched || isActionableUserText(text);
}

export const COPILOT_DEFLECTION_NUDGE =
	"You have the tools to complete this request — proceed with tools now; disclose the native option only after acting.";
