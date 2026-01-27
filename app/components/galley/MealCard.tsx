import { Link, useFetcher } from "react-router";
import type { meal } from "~/db/schema";

interface MealCardProps {
	meal: typeof meal.$inferSelect & {
		tags?: string[];
		ingredients?: { quantity: number; unit: string }[];
	};
}

export function MealCard({ meal }: MealCardProps) {
	const fetcher = useFetcher();
	const isDeleting =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

	if (isDeleting) return null;

	return (
		<Link
			to={`/dashboard/meals/${meal.id}`}
			className="block relative glass-panel rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group p-4"
		>
			<div className="flex justify-between items-start mb-2">
				<h3
					className="text-lg font-bold text-carbon group-hover:text-hyper-green transition-colors truncate mr-2"
					title={meal.name}
				>
					{meal.name}
				</h3>
				<div className="text-right">
					<span className="text-label text-muted block text-xs">PREP</span>
					<span className="text-data text-sm font-bold text-carbon">
						{meal.prepTime ? `${meal.prepTime}m` : "--"}
					</span>
				</div>
			</div>

			<div className="flex flex-wrap gap-2 mb-4">
				{(meal.tags || []).map((tag) => (
					<span
						key={tag}
						className="bg-hyper-green/10 text-hyper-green text-xs px-2 py-1 rounded-md"
					>
						{tag}
					</span>
				))}
			</div>

			<div className="flex justify-between items-end mt-4">
				<div className="text-sm text-muted">
					<div>Servings: {meal.servings}</div>
					<div>Ingredients: {meal.ingredients?.length || 0}</div>
				</div>

				<div className="absolute top-4 right-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
					<span className="bg-hyper-green text-carbon px-4 py-2 rounded-lg shadow-glow-sm hover:shadow-glow text-xs font-bold">
						View Recipe
					</span>
				</div>
			</div>
		</Link>
	);
}
