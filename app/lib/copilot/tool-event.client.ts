export function resolveCopilotToolEnd(
	event: { toolCallId?: string; ok?: boolean },
	toolNames: Map<string, string>,
): { toolName: string; succeeded: boolean } {
	const toolName = event.toolCallId
		? toolNames.get(event.toolCallId)
		: undefined;
	if (event.toolCallId) {
		toolNames.delete(event.toolCallId);
	}
	return {
		toolName: toolName ?? "tool",
		succeeded: event.ok === true,
	};
}
