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
		<div className="block relative glass-panel rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group p-4">
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
			</div>

			{/* Action Overlay */}
			<div className="absolute inset-0 bg-carbon/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px] rounded-xl z-10">
				<Link
					to={`/dashboard/meals/${meal.id}`}
					className="bg-platinum text-carbon font-bold px-4 py-2 rounded-lg hover:bg-white transition-all shadow-lg text-sm"
				>
					View
				</Link>
				<Link
					to={`/dashboard/meals/${meal.id}/edit`}
					className="bg-hyper-green text-carbon font-bold px-4 py-2 rounded-lg hover:shadow-glow transition-all shadow-lg text-sm"
				>
					Edit
				</Link>
				<fetcher.Form method="post" onSubmit={(e) => e.stopPropagation()}>
					<input type="hidden" name="intent" value="delete" />
					<input type="hidden" name="mealId" value={meal.id} />
					<button
						type="submit"
						className="bg-danger text-white font-bold px-4 py-2 rounded-lg hover:bg-danger/90 transition-all shadow-lg text-sm"
					>
						Delete
					</button>
				</fetcher.Form>
			</div>
		</div>
	);
}
