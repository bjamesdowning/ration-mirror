import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { MealGrid } from "~/components/galley/MealGrid";
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

	const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const selectedTag = e.target.value;
		if (selectedTag) {
			setSearchParams({ tag: selectedTag });
		} else {
			setSearchParams({});
		}
	};

	return (
		<>
			<DashboardHeader
				title="Meal Library"
				subtitle="Your saved recipes"
				showSearch={false}
				totalItems={meals.length}
			/>

			<div className="space-y-8">
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
					{/* Matching Toggle */}
					<div className="flex items-center gap-4">
						<button
							type="button"
							onClick={() => setMatchingEnabled(!matchingEnabled)}
							className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
								matchingEnabled
									? "bg-hyper-green text-carbon shadow-glow-sm"
									: "bg-platinum text-carbon hover:bg-platinum/80"
							}`}
						>
							{matchingEnabled ? "✓ Match Mode Active" : "Enable Match Mode"}
						</button>
					</div>

					{/* Tag Filter */}
					<div className="flex items-center gap-2">
						<label
							htmlFor="tag-filter"
							className="text-xs text-muted font-medium"
						>
							Filter by tag:
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
					</div>

					<Link
						to="new"
						className="px-6 py-2 bg-hyper-green text-carbon font-bold rounded-xl shadow-glow hover:shadow-glow-sm transition-all"
					>
						+ New Recipe
					</Link>
				</div>

				<MealGrid meals={meals} enableMatching={matchingEnabled} />
			</div>
		</>
	);
}
