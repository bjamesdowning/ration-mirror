import {
	resolveCopilotActivityDisplay,
	type TurnPhase,
} from "~/lib/copilot/activity-display";

type CopilotActivityIndicatorProps = {
	turnPhase: TurnPhase;
	toolName: string | null;
	toolSucceeded: boolean | null;
};

function ThinkingDots() {
	return (
		<span className="inline-flex items-center gap-1" aria-hidden>
			<span className="size-1.5 animate-pulse rounded-full bg-hyper-green [animation-delay:0ms]" />
			<span className="size-1.5 animate-pulse rounded-full bg-hyper-green [animation-delay:150ms]" />
			<span className="size-1.5 animate-pulse rounded-full bg-hyper-green [animation-delay:300ms]" />
		</span>
	);
}

export function CopilotActivityIndicator({
	turnPhase,
	toolName,
	toolSucceeded,
}: CopilotActivityIndicatorProps) {
	const display = resolveCopilotActivityDisplay(
		turnPhase,
		toolName,
		toolSucceeded,
	);

	if (display.kind === "hidden") return null;

	if (display.kind === "thinking") {
		return (
			<div
				className="flex items-center gap-2 rounded-xl border border-hyper-green/25 bg-hyper-green/10 p-3 text-sm text-carbon"
				role="status"
				aria-live="polite"
			>
				<span className="inline-block size-4 animate-spin rounded-full border-2 border-hyper-green/30 border-t-hyper-green" />
				<span>Copilot is thinking</span>
				<ThinkingDots />
			</div>
		);
	}

	return (
		<div
			className="flex items-center gap-2 rounded-xl border border-hyper-green/25 bg-hyper-green/10 p-3 text-sm text-carbon"
			role="status"
			aria-live="polite"
		>
			{display.running ? (
				<span className="inline-block size-4 animate-spin rounded-full border-2 border-hyper-green/30 border-t-hyper-green" />
			) : (
				<span
					className={
						display.succeeded === false ? "text-red-600" : "text-hyper-green"
					}
					aria-hidden
				>
					{display.succeeded === false ? "!" : "✓"}
				</span>
			)}
			<span>{display.label}</span>
		</div>
	);
}

export type { TurnPhase };
