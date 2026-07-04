interface ManifestDaySupplyToggleProps {
	date: string;
	includedInSupply: boolean;
	onToggle: (date: string) => void;
	disabled?: boolean;
	compact?: boolean;
}

export function ManifestDaySupplyToggle({
	date,
	includedInSupply,
	onToggle,
	disabled = false,
	compact = false,
}: ManifestDaySupplyToggleProps) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => onToggle(date)}
			title={
				includedInSupply
					? "Included in shopping list — tap to exclude this day"
					: "Excluded from shopping list — tap to include this day"
			}
			className={`inline-flex items-center gap-1 rounded-full font-mono uppercase tracking-wider transition-colors disabled:opacity-50 ${
				compact ? "text-[10px] px-2 py-0.5" : "text-[10px] px-2.5 py-1"
			} ${
				includedInSupply
					? "bg-hyper-green/15 text-hyper-green hover:bg-hyper-green/25"
					: "bg-platinum text-muted hover:text-carbon dark:bg-white/10"
			}`}
		>
			{includedInSupply ? "On Supply" : "Off Supply"}
		</button>
	);
}
