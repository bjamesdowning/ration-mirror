import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { AssistantMarkdown } from "./AssistantMarkdown";

type CopilotReasoningState = "streaming" | "complete";

type CopilotReasoningBlockProps = {
	reasoning?: string;
	reasoningState?: CopilotReasoningState;
};

export function CopilotReasoningBlock({
	reasoning,
	reasoningState,
}: CopilotReasoningBlockProps) {
	const [expanded, setExpanded] = useState(false);
	const hasReasoning = (reasoning?.trim().length ?? 0) > 0;
	if (!hasReasoning && reasoningState !== "streaming") return null;

	const isStreaming = reasoningState === "streaming";
	const label = isStreaming ? "Thinking…" : "Show thinking";

	return (
		<div className="mb-2 border-platinum/60 border-b pb-2 dark:border-white/10">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				aria-expanded={expanded}
				className="flex w-full items-center gap-2 text-left font-mono text-[11px] text-muted uppercase tracking-[0.14em]"
			>
				<ChevronDown
					className={`size-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""} ${isStreaming ? "animate-pulse" : ""}`}
					aria-hidden
				/>
				<span>{label}</span>
			</button>
			{expanded && hasReasoning ? (
				<div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-platinum/30 px-2 py-1.5 font-mono text-[11px] text-muted leading-relaxed dark:bg-white/[0.04]">
					<AssistantMarkdown content={reasoning ?? ""} />
				</div>
			) : null}
		</div>
	);
}
