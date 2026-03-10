import { Flame } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useFetcher } from "react-router";
import { Toast } from "~/components/shell/Toast";
import { useToast } from "~/hooks/useToast";
import { useConfirm } from "~/lib/confirm-context";
import { getFormActionPath } from "~/lib/form-utils";
import type { MealMatchResult } from "~/lib/matching.server";
import { CheckIcon, MealIcon, RecipeIcon } from "../icons/HubIcons";

interface MealSuggestionsCardProps {
	meals: MealMatchResult[];
}

type CookFetcherData =
	| {
			result?: { cooked: boolean; ingredientsDeducted?: number };
			error?: string;
	  }
	| undefined;

function getCookingMealIdFromAction(
	formAction: string | undefined,
): string | null {
	if (!formAction) return null;
	const match = /\/api\/meals\/([^/]+)\/cook$/.exec(formAction);
	return match ? match[1] : null;
}

function getMatchColor(percentage: number): string {
	if (percentage >= 100) return "text-success";
	if (percentage >= 75) return "text-hyper-green";
	if (percentage >= 50) return "text-warning";
	return "text-muted";
}

function getMatchBgColor(percentage: number): string {
	if (percentage >= 100) return "bg-success/10";
	if (percentage >= 75) return "bg-hyper-green/10";
	if (percentage >= 50) return "bg-warning/10";
	return "bg-muted/10";
}

export function MealSuggestionsCard({ meals }: MealSuggestionsCardProps) {
	const hasItems = meals.length > 0;
	const { confirm } = useConfirm();
	const fetcher = useFetcher<CookFetcherData>();
	const successToast = useToast({ duration: 4000 });
	const errorToast = useToast({ duration: 5000 });
	const errorMessageRef = useRef<string>("");

	const cookingMealId = getCookingMealIdFromAction(
		fetcher.state !== "idle" ? (fetcher.formAction ?? undefined) : undefined,
	);

	// Show success toast when cook completes
	useEffect(() => {
		if (fetcher.state !== "idle" || !fetcher.data?.result?.cooked) return;
		successToast.show();
	}, [fetcher.state, fetcher.data?.result?.cooked, successToast.show]);

	// Show error toast when cook fails
	useEffect(() => {
		if (!fetcher.data?.error) return;
		errorMessageRef.current = fetcher.data.error;
		errorToast.show();
	}, [fetcher.data?.error, errorToast.show]);

	return (
		<div className="glass-panel rounded-xl p-6">
			{/* Header */}
			<div className="flex items-start justify-between mb-6">
				<div className="flex items-center gap-2">
					<MealIcon />
					<div>
						<h3 className="text-label text-carbon font-bold">
							Meals You Can Make
						</h3>
						<p className="text-xs text-muted mt-1">
							Based on your current Cargo
						</p>
					</div>
				</div>
				{hasItems && (
					<Link
						to="/hub/galley"
						className="text-xs text-hyper-green hover:underline"
					>
						See All →
					</Link>
				)}
			</div>

			{/* Meal Cards Grid */}
			{hasItems ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{meals.slice(0, 6).map((result) => {
						const defaultServings = result.meal.servings || 1;
						const servingLabel =
							defaultServings === 1
								? "1 serving"
								: `${defaultServings} servings`;
						const isCookingThis =
							fetcher.state !== "idle" && cookingMealId === result.meal.id;

						return (
							<Link
								key={result.meal.id}
								to={`/hub/galley/${result.meal.id}`}
								className="group flex flex-col bg-ceramic rounded-lg p-4 hover:shadow-md transition-all border border-carbon/5 hover:border-hyper-green/30"
							>
								{/* Match Badge */}
								<div className="flex justify-between items-start mb-2">
									<span
										className={`text-xs font-bold px-2 py-1 rounded-md ${getMatchColor(result.matchPercentage)} ${getMatchBgColor(result.matchPercentage)}`}
									>
										{result.matchPercentage}% match
									</span>
									{result.canMake && (
										<span className="flex items-center gap-1 text-xs text-success">
											<CheckIcon className="w-3 h-3" /> Ready
										</span>
									)}
								</div>

								{/* Meal Name */}
								<h4 className="text-sm font-bold text-carbon group-hover:text-hyper-green transition-colors truncate mb-1">
									{result.meal.name}
								</h4>

								{/* Quick Stats */}
								<div className="flex items-center gap-3 text-xs text-muted">
									{result.meal.prepTime && (
										<span>{result.meal.prepTime}m prep</span>
									)}
									<span>{defaultServings} servings</span>
								</div>

								{/* Missing Ingredients Hint */}
								{result.missingIngredients.length > 0 && !result.canMake && (
									<p className="text-xs text-muted mt-2 truncate">
										Missing:{" "}
										{result.missingIngredients.map((i) => i.name).join(", ")}
									</p>
								)}

								{/* Cook Now — only when makeable; stops propagation so Link doesn't navigate */}
								{result.canMake && (
									<form
										method="post"
										action={`/api/meals/${result.meal.id}/cook`}
										className="mt-3 pt-3 border-t border-carbon/5"
										onClick={(e) => e.stopPropagation()}
										onKeyDown={(e) => e.stopPropagation()}
										onSubmit={async (e) => {
											e.preventDefault();
											const form = e.currentTarget;
											if (
												!(await confirm({
													title: `Cook ${result.meal.name} for ${servingLabel}?`,
													message:
														"This will deduct ingredients from your Cargo.",
													confirmLabel: "Cook Now",
													variant: "warning",
												}))
											)
												return;
											fetcher.submit(new FormData(form), {
												method: "POST",
												action: getFormActionPath(form),
											});
										}}
									>
										<button
											type="submit"
											disabled={isCookingThis}
											aria-label="Cook Now"
											className="flex items-center justify-center gap-2 w-full min-h-[44px] py-3 rounded-lg bg-hyper-green text-carbon font-bold text-sm hover:shadow-glow-sm transition-all disabled:opacity-75 disabled:cursor-wait"
										>
											{isCookingThis ? (
												<span className="animate-pulse">Cooking...</span>
											) : (
												<>
													<Flame className="w-4 h-4 shrink-0" aria-hidden />
													<span className="sr-only">Cook Now</span>
												</>
											)}
										</button>
									</form>
								)}
							</Link>
						);
					})}
				</div>
			) : (
				<div className="text-center py-8 flex flex-col items-center">
					<RecipeIcon />
					<h4 className="text-carbon font-medium mb-2 mt-4">No Meals Yet</h4>
					<p className="text-sm text-muted mb-4">
						Add some meals to get personalized suggestions
					</p>
					<Link
						to="/hub/galley/new"
						className="inline-block bg-hyper-green text-carbon text-sm font-bold px-4 py-2 rounded-lg hover:shadow-glow-sm transition-all"
					>
						+ Add Meal
					</Link>
				</div>
			)}

			{/* Footer with tips */}
			{hasItems && (
				<div className="mt-6 pt-4 border-t border-carbon/10 flex items-center justify-between">
					<p className="text-xs text-muted">
						{meals.filter((m) => m.canMake).length} meals ready to cook
					</p>
					<Link
						to="/hub/galley?match=enabled"
						className="text-xs text-hyper-green hover:underline"
					>
						Enable Match Mode →
					</Link>
				</div>
			)}

			{/* Cook success toast */}
			{successToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					title="Cooked!"
					description="Ingredients deducted from Cargo."
					onDismiss={successToast.hide}
				/>
			)}

			{/* Cook error toast */}
			{errorToast.isOpen && (
				<Toast
					variant="info"
					position="bottom-right"
					title="Couldn't deduct ingredients"
					description={
						errorMessageRef.current.replace(
							/^Insufficient Cargo for:\s*/i,
							"You don't have enough: ",
						) || errorMessageRef.current
					}
					onDismiss={errorToast.hide}
				/>
			)}
		</div>
	);
}
