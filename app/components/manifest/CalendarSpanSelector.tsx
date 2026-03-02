import { useFetcher } from "react-router";

type CalendarSpan = 3 | 5 | 7;

interface CalendarSpanSelectorProps {
	currentSpan: CalendarSpan;
	onSpanChange?: (span: CalendarSpan) => void;
}

export function CalendarSpanSelector({
	currentSpan,
	onSpanChange,
}: CalendarSpanSelectorProps) {
	const fetcher = useFetcher();

	const handleChange = (span: CalendarSpan) => {
		if (span === currentSpan) return;
		onSpanChange?.(span);
		fetcher.submit(
			{ intent: "update-manifest-calendar-span", span: String(span) },
			{ method: "post", action: "/hub/settings" },
		);
	};

	return (
		<div className="flex items-center gap-2">
			<fieldset
				className="flex items-center rounded-lg overflow-hidden border border-platinum dark:border-white/10 m-0 p-0"
				aria-label="Calendar span"
			>
				<legend className="sr-only">Number of days shown in Manifest</legend>
				{([3, 5, 7] as const).map((span) => (
					<button
						key={span}
						type="button"
						onClick={() => handleChange(span)}
						aria-pressed={currentSpan === span}
						aria-label={`${span} days`}
						className={`px-4 py-2 text-sm font-medium transition-colors ${
							currentSpan === span
								? "bg-hyper-green text-carbon"
								: "text-muted hover:bg-platinum/50 dark:hover:bg-white/10"
						}`}
					>
						{span} days
					</button>
				))}
			</fieldset>
			{fetcher.state !== "idle" && (
				<span className="text-hyper-green animate-pulse text-sm">
					Saving...
				</span>
			)}
		</div>
	);
}
