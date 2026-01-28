import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import { GenerateMealButton } from "~/components/galley/GenerateMealButton";
import { MealGrid } from "~/components/galley/MealGrid";
import { MealQuickAdd } from "~/components/galley/MealQuickAdd";
import { requireAuth } from "~/lib/auth.server";
import { getMeals, getUserMealTags } from "~/lib/meals.server";
import type { Route } from "./+types/meals";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(context, request);
	const url = new URL(request.url);
	const tag = url.searchParams.get("tag") || undefined;

	const [meals, availableTags] = await Promise.all([
		getMeals(context.cloudflare.env.DB, user.id, tag),
		getUserMealTags(context.cloudflare.env.DB, user.id),
	]);
	return { meals, availableTags, currentTag: tag };
}

export default function MealsIndex({ loaderData }: Route.ComponentProps) {
	const { meals, availableTags, currentTag } = loaderData;
	const [, setSearchParams] = useSearchParams();
	const [matchingEnabled, setMatchingEnabled] = useState(false);
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const selectedTag = e.target.value;
		if (selectedTag) {
			setSearchParams({ tag: selectedTag });
		} else {
			setSearchParams({});
		}
	};

	// Local search filtering (client-side for speed, no credits)
	const filteredMeals = useMemo(() => {
		if (!searchQuery.trim()) return meals;
		const query = searchQuery.toLowerCase();
		return meals.filter(
			(meal) =>
				meal.name.toLowerCase().includes(query) ||
				meal.description?.toLowerCase().includes(query) ||
				meal.tags?.some((tag) => tag.toLowerCase().includes(query)),
		);
	}, [meals, searchQuery]);

	return (
		<>
			<DashboardHeader
				title="Meal Library"
				subtitle="Your saved recipes // Kitchen Intel"
				showSearch={true}
				totalItems={filteredMeals.length}
				searchPlaceholder="Search meals..."
				onSearchChange={setSearchQuery}
			/>

			<div className="space-y-6">
				{/* Unified Toolbar */}
				<PanelToolbar
					primaryAction={<GenerateMealButton />}
					quickAddPlaceholder="Quick Add Meal"
					showQuickAdd={showQuickAdd}
					onToggleQuickAdd={() => setShowQuickAdd(!showQuickAdd)}
					quickAddForm={
						<MealQuickAdd onSuccess={() => setShowQuickAdd(false)} />
					}
					filterControls={
						<>
							{/* Match Mode Toggle */}
							<button
								type="button"
								onClick={() => setMatchingEnabled(!matchingEnabled)}
								className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
									matchingEnabled
										? "bg-hyper-green text-carbon shadow-glow-sm"
										: "bg-platinum text-carbon hover:bg-platinum/80"
								}`}
							>
								{matchingEnabled ? "✓ Match Mode" : "Match Mode"}
							</button>

							{/* Tag Filter */}
							<label
								htmlFor="tag-filter"
								className="text-xs text-muted font-medium"
							>
								Filter:
							</label>
							<select
								id="tag-filter"
								value={currentTag || ""}
								onChange={handleTagChange}
								className="bg-platinum border border-carbon/10 px-3 py-2 rounded-lg text-sm text-carbon focus:outline-none focus:ring-2 focus:ring-hyper-green/50 cursor-pointer"
							>
								<option value="">All Recipes</option>
								{availableTags.map((tag) => (
									<option key={tag} value={tag}>
										{tag.charAt(0).toUpperCase() + tag.slice(1)}
									</option>
								))}
							</select>
							{currentTag && (
								<Link
									to="/dashboard/meals"
									className="text-xs text-hyper-green hover:text-hyper-green/80 transition-colors"
								>
									Clear
								</Link>
							)}
						</>
					}
				/>

				{/* Empty State */}
				{filteredMeals.length === 0 && !searchQuery && (
					<div className="text-center py-16 glass-panel rounded-2xl">
						<div className="text-6xl mb-6">🍽️</div>
						<h3 className="text-display text-xl text-carbon mb-2">
							No Recipes Yet
						</h3>
						<p className="text-sm text-muted mb-6 max-w-md mx-auto">
							Create your first meal or let AI generate suggestions based on
							your pantry inventory.
						</p>
						<div className="flex flex-wrap justify-center gap-4">
							<GenerateMealButton />
							<button
								type="button"
								onClick={() => setShowQuickAdd(true)}
								className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
							>
								Create Recipe
							</button>
						</div>
					</div>
				)}

				{/* No Search Results */}
				{filteredMeals.length === 0 && searchQuery && (
					<div className="text-center py-12 glass-panel rounded-2xl">
						<div className="text-4xl mb-4">🔍</div>
						<h3 className="text-lg text-carbon mb-2">No Results</h3>
						<p className="text-sm text-muted">
							No meals found matching "{searchQuery}"
						</p>
					</div>
				)}

				{/* Meal Grid */}
				{filteredMeals.length > 0 && (
					<MealGrid meals={filteredMeals} enableMatching={matchingEnabled} />
				)}
			</div>
		</>
	);
}
