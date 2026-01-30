import { useFetcher } from "react-router";
import { StandardCard } from "~/components/common/StandardCard";
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

	const handleDelete = () => {
		fetcher.submit({ intent: "delete", mealId: meal.id }, { method: "post" });
	};

	return (
		<StandardCard
			actions={[
				{
					label: "View",
					to: `/dashboard/meals/${meal.id}`,
				},
				{
					label: "Edit",
					to: `/dashboard/meals/${meal.id}/edit`,
				},
				{
					label: "Delete",
					onClick: handleDelete,
					destructive: true,
				},
			]}
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
			</div>
		</StandardCard>
	);
}
