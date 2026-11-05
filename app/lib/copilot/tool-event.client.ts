import { copilotToolDoneLabel } from "./tool-labels";

export function resolveCopilotToolEnd(
	event: { toolCallId?: string; ok?: boolean; result?: unknown },
	toolNames: Map<string, string>,
): { toolName: string; succeeded: boolean; doneLabel?: string } {
	const toolName = event.toolCallId
		? toolNames.get(event.toolCallId)
		: undefined;
	if (event.toolCallId) {
		toolNames.delete(event.toolCallId);
	}
	const resolvedName = toolName ?? "tool";
	const succeeded = event.ok === true;
	const doneLabel = succeeded
		? copilotToolDoneLabel(resolvedName, event.result)
		: undefined;
	const staticDone = copilotToolDoneLabel(resolvedName);
	return {
		toolName: resolvedName,
		succeeded,
		...(doneLabel && doneLabel !== staticDone ? { doneLabel } : {}),
	};
}
