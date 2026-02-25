import { useFetcher } from "react-router";
import { CheckIcon, ConsumeIcon } from "~/components/icons/PageIcons";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";

interface MealSlotCardProps {
	entry: MealPlanEntryWithMeal;
	planId: string;
	readOnly?: boolean;
	onConsume?: (entryId: string) => void;
	isConsuming?: boolean;
}

export function MealSlotCard({
	entry,
	planId,
	readOnly = false,
	onConsume,
	isConsuming = false,
}: MealSlotCardProps) {
	const fetcher = useFetcher();
	const isRemoving = fetcher.state !== "idle";
	const isConsumed = !!entry.consumedAt;
	const canConsume = !readOnly && !isConsumed && !!onConsume;

	const handleRemove = () => {
		fetcher.submit(null, {
			method: "DELETE",
			action: `/api/meal-plans/${planId}/entries/${entry.id}`,
		});
	};

	const handleConsume = () => {
		if (!canConsume || isConsuming) return;
		onConsume?.(entry.id);
	};

	const effectiveServings = entry.servingsOverride ?? entry.mealServings;

	return (
		<div
			className={`group relative flex items-start justify-between bg-white/60 dark:bg-carbon/5 border border-platinum rounded-xl px-3 py-2.5 transition-all ${
				isRemoving ? "opacity-40 scale-95" : ""
			} ${isConsumed ? "opacity-75" : ""}`}
		>
			<div className="flex-1 min-w-0 pr-2">
				<p
					className={`text-sm font-semibold truncate capitalize ${
						isConsumed ? "text-muted line-through" : "text-carbon"
					}`}
				>
					{entry.mealName}
				</p>
				<p className="text-xs text-muted mt-0.5 font-mono">
					{entry.mealType === "provision" ? (
						<>
							×{effectiveServings}
							{entry.servingsOverride ? " (custom)" : ""}
						</>
					) : (
						<>
							{effectiveServings}{" "}
							{effectiveServings === 1 ? "serving" : "servings"}
							{entry.servingsOverride ? " (custom)" : ""}
						</>
					)}
				</p>
				{entry.notes && (
					<p className="text-xs text-muted mt-1 italic truncate">
						{entry.notes}
					</p>
				)}
			</div>

			{!readOnly && (
				<div className="flex items-center gap-1 shrink-0">
					{canConsume && (
						<button
							type="button"
							onClick={handleConsume}
							disabled={isConsuming}
							aria-label={`Consume ${entry.mealName} (deduct from Cargo)`}
							className="p-1.5 rounded-lg text-hyper-green hover:bg-hyper-green/10 transition-all disabled:opacity-50"
						>
							<ConsumeIcon className="w-4 h-4" />
						</button>
					)}
					{isConsumed && (
						<span className="text-hyper-green" role="img" aria-label="Consumed">
							<CheckIcon className="w-4 h-4" />
						</span>
					)}
					<button
						type="button"
						onClick={handleRemove}
						disabled={isRemoving}
						aria-label={`Remove ${entry.mealName}`}
						className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-all"
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
				</div>
			)}
		</div>
	);
}
