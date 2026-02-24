import { useFetcher } from "react-router";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";

interface MealSlotCardProps {
	entry: MealPlanEntryWithMeal;
	planId: string;
	readOnly?: boolean;
}

export function MealSlotCard({
	entry,
	planId,
	readOnly = false,
}: MealSlotCardProps) {
	const fetcher = useFetcher();
	const isRemoving = fetcher.state !== "idle";

	const handleRemove = () => {
		fetcher.submit(null, {
			method: "DELETE",
			action: `/api/meal-plans/${planId}/entries/${entry.id}`,
		});
	};

	const effectiveServings = entry.servingsOverride ?? entry.mealServings;

	return (
		<div
			className={`group relative flex items-start justify-between bg-white/60 dark:bg-carbon/5 border border-platinum rounded-xl px-3 py-2.5 transition-all ${
				isRemoving ? "opacity-40 scale-95" : ""
			}`}
		>
			<div className="flex-1 min-w-0 pr-2">
				<p className="text-sm font-semibold text-carbon truncate">
					{entry.mealName}
				</p>
				<p className="text-xs text-muted mt-0.5 font-mono">
					{effectiveServings} {effectiveServings === 1 ? "serving" : "servings"}
					{entry.servingsOverride ? " (custom)" : ""}
				</p>
				{entry.notes && (
					<p className="text-xs text-muted mt-1 italic truncate">
						{entry.notes}
					</p>
				)}
			</div>

			{!readOnly && (
				<button
					type="button"
					onClick={handleRemove}
					disabled={isRemoving}
					aria-label={`Remove ${entry.mealName}`}
					className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-all"
				>
					<svg
						className="w-3.5 h-3.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<title>Remove</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			)}
		</div>
	);
}
