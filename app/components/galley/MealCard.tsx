import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { StandardCard } from "~/components/common/StandardCard";
import { MealEditModal } from "~/components/galley/MealEditModal";
import type { meal } from "~/db/schema";

// Helper type for inventory item from DB
type InventoryItem = {
	id: string;
	name: string;
	unit: string;
	quantity: number;
};

interface MealCardProps {
	meal: typeof meal.$inferSelect & {
		tags?: string[];
		ingredients?: {
			inventoryId?: string | null;
			ingredientName: string;
			quantity: number;
			unit: string;
			isOptional?: boolean | null;
			orderIndex?: number | null;
		}[];
		equipment?: string[] | null;
		customFields?: string | Record<string, any> | null;
	};
	availableIngredients?: InventoryItem[];
}

export function MealCard({ meal, availableIngredients = [] }: MealCardProps) {
	const fetcher = useFetcher();
	const navigate = useNavigate();
	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	const isDeleting =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";
	const isUpdating =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "update";

	// Handle successful update
	useEffect(() => {
		if (fetcher.state !== "idle") {
			setIsSaving(true);
		}
		if (isSaving && fetcher.state === "idle" && fetcher.data?.success) {
			setIsEditing(false);
			setIsSaving(false);
		}
	}, [fetcher.state, fetcher.data, isSaving]);

	if (isDeleting) return null;

	const handleDelete = () => {
		fetcher.submit({ intent: "delete", mealId: meal.id }, { method: "post" });
	};

	return (
		<>
			<StandardCard
				actions={[
					{
						label: "View",
						onClick: () => navigate(`/dashboard/meals/${meal.id}`),
					},
					{
						label: "Edit",
						onClick: () => setIsEditing(true),
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

			{isEditing && (
				<MealEditModal
					meal={meal}
					availableIngredients={availableIngredients}
					onClose={() => setIsEditing(false)}
					fetcher={fetcher}
					isUpdating={isUpdating}
				/>
			)}
		</>
	);
}
