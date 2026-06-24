export type CalendarSpan = 3 | 5 | 7;

interface CalendarSpanPickerProps {
	currentSpan: CalendarSpan;
	onChange: (span: CalendarSpan) => void;
	/** Stretch buttons to fill container width (e.g. mobile filter drawer). */
	fullWidth?: boolean;
}

export function CalendarSpanPicker({
	currentSpan,
	onChange,
	fullWidth = false,
}: CalendarSpanPickerProps) {
	return (
		<fieldset
			className={`flex items-center rounded-lg overflow-hidden border border-platinum dark:border-white/10 m-0 p-0 ${
				fullWidth ? "w-full" : ""
			}`}
			aria-label="Calendar span"
		>
			<legend className="sr-only">Number of days shown in Manifest</legend>
			{([3, 5, 7] as const).map((span) => (
				<button
					key={span}
					type="button"
					onClick={() => onChange(span)}
					aria-pressed={currentSpan === span}
					aria-label={`${span} days`}
					className={`${fullWidth ? "flex-1" : ""} px-4 py-2 text-sm font-medium transition-colors ${
						currentSpan === span
							? "bg-hyper-green text-carbon"
							: "text-muted hover:bg-platinum/50 dark:hover:bg-white/10"
					}`}
				>
					{span} days
				</button>
			))}
		</fieldset>
	);
}
