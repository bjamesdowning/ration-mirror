import { Link } from "react-router";
import type { MealMatchResult } from "~/lib/matching.server";
import { CheckIcon, MealIcon, RecipeIcon } from "../icons/DashboardIcons";

interface MealSuggestionsCardProps {
	meals: MealMatchResult[];
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
							Based on your current pantry
						</p>
					</div>
				</div>
				{hasItems && (
					<Link
						to="/dashboard/meals"
						className="text-xs text-hyper-green hover:underline"
					>
						See All →
					</Link>
				)}
			</div>

			{/* Meal Cards Grid */}
			{hasItems ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{meals.slice(0, 6).map((result) => (
						<Link
							key={result.meal.id}
							to={`/dashboard/meals/${result.meal.id}`}
							className="group block bg-white rounded-lg p-4 hover:shadow-md transition-all border border-carbon/5 hover:border-hyper-green/30"
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
								<span>{result.meal.servings || 1} servings</span>
							</div>

							{/* Missing Ingredients Hint */}
							{result.missingIngredients.length > 0 && !result.canMake && (
								<p className="text-xs text-muted mt-2 truncate">
									Missing:{" "}
									{result.missingIngredients.map((i) => i.name).join(", ")}
								</p>
							)}
						</Link>
					))}
				</div>
			) : (
				<div className="text-center py-8 flex flex-col items-center">
					<RecipeIcon />
					<h4 className="text-carbon font-medium mb-2 mt-4">No Recipes Yet</h4>
					<p className="text-sm text-muted mb-4">
						Add some recipes to get personalized suggestions
					</p>
					<Link
						to="/dashboard/meals/new"
						className="inline-block bg-hyper-green text-carbon text-sm font-bold px-4 py-2 rounded-lg hover:shadow-glow-sm transition-all"
					>
						+ Add Recipe
					</Link>
				</div>
			)}

			{/* Footer with tips */}
			{hasItems && (
				<div className="mt-6 pt-4 border-t border-carbon/10 flex items-center justify-between">
					<p className="text-xs text-muted">
						{meals.filter((m) => m.canMake).length} recipes ready to cook
					</p>
					<Link
						to="/dashboard/meals?match=enabled"
						className="text-xs text-hyper-green hover:underline"
					>
						Enable Match Mode →
					</Link>
				</div>
			)}
		</div>
	);
}
