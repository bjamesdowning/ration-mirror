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
	const allDone = remaining === 0;

	return (
		<div className="flex items-center gap-3 mb-4">
			{/* Segmented color stripe */}
			<div className="flex-1 h-1.5 rounded-full bg-platinum/60 overflow-hidden">
				<div
					className="h-full bg-hyper-green rounded-full transition-all duration-500"
					style={{ width: `${progressPct}%` }}
				/>
			</div>
			{/* Compact inline label */}
			<span className="text-[11px] font-mono text-muted shrink-0 tabular-nums">
				{allDone ? (
					<span className="text-hyper-green font-semibold">✓ all done</span>
				) : (
					<>
						<span className="text-hyper-green font-semibold">{consumed}</span>
						<span className="text-muted/50"> / </span>
						{total}
					</>
				)}
			</span>
		</div>
	);
}
