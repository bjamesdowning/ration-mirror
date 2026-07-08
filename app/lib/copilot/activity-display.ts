import { copilotToolLabel } from "~/lib/copilot/tool-labels";

export type TurnPhase =
	| "idle"
	| "connecting"
	| "thinking"
	| "tool_running"
	| "tool_done"
	| "streaming";

export type CopilotActivityDisplay =
	| { kind: "hidden" }
	| { kind: "thinking" }
	| {
			kind: "tool";
			label: string;
			running: boolean;
			succeeded: boolean | null;
	  };

export function resolveCopilotActivityDisplay(
	turnPhase: TurnPhase,
	toolName: string | null,
	toolSucceeded: boolean | null,
): CopilotActivityDisplay {
	if (turnPhase === "idle" || turnPhase === "streaming") {
		return { kind: "hidden" };
	}

	if (turnPhase === "thinking" || turnPhase === "connecting") {
		return { kind: "thinking" };
	}

	if ((turnPhase === "tool_running" || turnPhase === "tool_done") && toolName) {
		const phase =
			turnPhase === "tool_done"
				? toolSucceeded === false
					? "error"
					: "done"
				: "running";
		return {
			kind: "tool",
			label: copilotToolLabel(toolName, phase),
			running: turnPhase === "tool_running",
			succeeded: turnPhase === "tool_done" ? toolSucceeded : null,
		};
	}

	return { kind: "hidden" };
}
