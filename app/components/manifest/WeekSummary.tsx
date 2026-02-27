import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";

interface WeekSummaryProps {
	entries: MealPlanEntryWithMeal[];
}

export function WeekSummary({ entries }: WeekSummaryProps) {
	if (entries.length === 0) return null;

	const total = entries.length;
	const consumed = entries.filter((e) => !!e.consumedAt).length;
	const remaining = total - consumed;
	const progressPct = total > 0 ? Math.round((consumed / total) * 100) : 0;

	return (
		<div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-platinum/40 border border-platinum/60 mb-4">
			{/* Stats */}
			<div className="flex items-center gap-3 text-xs font-mono text-muted flex-1 flex-wrap gap-y-1">
				<span>
					<span className="text-carbon font-semibold">{total}</span> planned
				</span>
				<span className="text-muted/40">·</span>
				<span>
					<span className="text-hyper-green font-semibold">{consumed}</span>{" "}
					consumed
				</span>
				<span className="text-muted/40">·</span>
				<span>
					<span className="text-carbon font-semibold">{remaining}</span>{" "}
					remaining
				</span>
			</div>

			{/* Progress bar */}
			<div className="flex items-center gap-2 shrink-0">
				<div className="w-24 h-1.5 bg-platinum rounded-full overflow-hidden">
					<div
						className="h-full bg-hyper-green rounded-full transition-all duration-500"
						style={{ width: `${progressPct}%` }}
					/>
				</div>
				<span className="text-[10px] font-mono text-muted w-8 text-right">
					{progressPct}%
				</span>
			</div>
		</div>
	);
}
