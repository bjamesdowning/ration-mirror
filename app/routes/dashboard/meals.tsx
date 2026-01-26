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
				title="GALLEY OPS"
				subtitle="protocols // loaded"
				showSearch={false}
				totalItems={meals.length}
			/>

			<div className="space-y-8">
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
					{/* Tag Filter */}
					<div className="flex items-center gap-2">
						<label
							htmlFor="tag-filter"
							className="text-xs uppercase opacity-70 font-mono"
						>
							Filter by Classification:
						</label>
						<select
							id="tag-filter"
							value={currentTag || ""}
							onChange={handleTagChange}
							className="bg-black border border-[#39FF14]/50 p-2 text-sm font-mono text-[#39FF14] uppercase focus:outline-none focus:border-[#39FF14] cursor-pointer"
						>
							<option value="">ALL PROTOCOLS</option>
							{availableTags.map((tag) => (
								<option key={tag} value={tag}>
									{tag.toUpperCase()}
								</option>
							))}
						</select>
						{currentTag && (
							<Link
								to="/dashboard/meals"
								className="text-xs opacity-70 hover:opacity-100 underline font-mono"
							>
								CLEAR
							</Link>
						)}
					</div>

					<Link
						to="new"
						className="px-6 py-2 bg-[#39FF14] text-black font-bold uppercase tracking-widest hover:bg-[#2bff00] shadow-[0_0_15px_rgba(57,255,20,0.5)] transition-all"
					>
						+ NEW PROTOCOL
					</Link>
				</div>

				<MealGrid meals={meals} />
			</div>
		</>
	);
}
