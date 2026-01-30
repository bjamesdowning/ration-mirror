import { useFetcher, useNavigate } from "react-router";
import { ActionMenu } from "~/components/hud/ActionMenu";
import type { meal } from "~/db/schema";

interface MealCardProps {
	meal: typeof meal.$inferSelect & {
		tags?: string[];
		ingredients?: { quantity: number; unit: string }[];
	};
}

export function MealCard({ meal }: MealCardProps) {
	const fetcher = useFetcher();
	const navigate = useNavigate();
	const isDeleting =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

	if (isDeleting) return null;

	const handleDelete = () => {
		fetcher.submit({ intent: "delete", mealId: meal.id }, { method: "post" });
	};

	return (
		<div className="block relative glass-panel rounded-xl shadow-sm hover:shadow-md transition-shadow group p-4">
			{/* Mobile Action Menu */}
			<div className="md:hidden absolute top-2 right-2 z-20">
				<ActionMenu
					actions={[
						{
							label: "View",
							onClick: () => navigate(`/dashboard/meals/${meal.id}`),
						},
						{
							label: "Edit",
							onClick: () => navigate(`/dashboard/meals/${meal.id}/edit`),
						},
						{
							label: "Delete",
							onClick: handleDelete,
							destructive: true,
						},
					]}
				/>
			</div>

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

			{/* Desktop Hover Overlay */}
			<div className="absolute inset-0 bg-carbon/60 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-3 backdrop-blur-[2px] rounded-xl z-30 hidden md:flex pointer-events-none group-hover:pointer-events-auto">
				<button
					type="button"
					onClick={() => navigate(`/dashboard/meals/${meal.id}`)}
					className="bg-platinum text-carbon font-bold px-4 py-2 rounded-lg hover:bg-white transition-all shadow-lg text-sm"
				>
					View
				</button>
				<button
					type="button"
					onClick={() => navigate(`/dashboard/meals/${meal.id}/edit`)}
					className="bg-hyper-green text-carbon font-bold px-4 py-2 rounded-lg hover:shadow-glow transition-all shadow-lg text-sm"
				>
					Edit
				</button>
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
