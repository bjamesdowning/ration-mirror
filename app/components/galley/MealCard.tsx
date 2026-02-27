import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { StandardCard } from "~/components/common/StandardCard";
import { MealEditModal } from "~/components/galley/MealEditModal";
import { CheckIcon, PlusIcon } from "~/components/icons/PageIcons";
import type { meal } from "~/db/schema";
import type { MealCustomFields } from "~/lib/types";

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
		customFields?: string | MealCustomFields | null;
	};
	availableIngredients?: InventoryItem[];
	isActive?: boolean;
	onToggleActive?: (mealId: string, nextActive: boolean) => void;
}

export function MealCard({
	meal,
	availableIngredients = [],
	isActive = false,
	onToggleActive,
}: MealCardProps) {
	const fetcher = useFetcher();
	const toggleFetcher = useFetcher<{
		success: boolean;
		mealId: string;
		isActive: boolean;
	}>();
	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [localActive, setLocalActive] = useState(isActive);

	const isDeleting =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";
	const isUpdating =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "update";
	const isToggling = toggleFetcher.state !== "idle";

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

	useEffect(() => {
		setLocalActive(isActive);
	}, [isActive]);

	useEffect(() => {
		if (!toggleFetcher.data?.mealId) return;
		if (toggleFetcher.data.mealId !== meal.id) return;
		const next = toggleFetcher.data.isActive;
		setLocalActive(next);
		// Note: Parent is already notified optimistically in handleToggleActive
	}, [toggleFetcher.data, meal.id]);

	if (isDeleting) return null;

	const handleDelete = () => {
		fetcher.submit({ intent: "delete", mealId: meal.id }, { method: "post" });
	};

	const handleToggleActive = () => {
		const nextActive = !localActive;
		setLocalActive(nextActive);
		onToggleActive?.(meal.id, nextActive);
		toggleFetcher.submit(null, {
			method: "post",
			action: `/api/meals/${meal.id}/toggle-active`,
		});
	};

	return (
		<>
			<div className="relative">
				{/* Toggle button floats ABOVE StandardCard's hover overlay (z-30) */}
				<button
					type="button"
					onClick={handleToggleActive}
					disabled={isToggling}
					aria-pressed={localActive}
					className={`absolute top-4 left-4 z-40 flex items-center justify-center w-7 h-7 border text-xs font-bold transition-all shadow-sm ${
						localActive
							? "bg-hyper-green text-carbon border-hyper-green"
							: "bg-platinum/70 text-muted border-carbon/20 hover:bg-platinum"
					}`}
					title={
						localActive ? "Selected for Supply list" : "Add to Supply list"
					}
				>
					{localActive ? (
						<CheckIcon className="w-3.5 h-3.5" />
					) : (
						<PlusIcon className="w-3.5 h-3.5" />
					)}
				</button>

				<StandardCard
					actions={[
						{
							label: "View",
							to: `/hub/galley/${meal.id}`,
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
						<div className="flex items-start gap-2 min-w-0">
							{/* Spacer to account for floating toggle button */}
							<div className="w-7 h-7 flex-shrink-0" />
							<h3
								className="text-lg font-bold text-carbon group-hover:text-hyper-green transition-colors truncate mr-2"
								title={meal.name}
							>
								{meal.name}
							</h3>
						</div>
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

					{(() => {
						let cf: Record<string, unknown> | null = null;
						if (typeof meal.customFields === "string") {
							try {
								cf = JSON.parse(meal.customFields) as Record<string, unknown>;
							} catch {
								return null;
							}
						} else if (
							meal.customFields &&
							typeof meal.customFields === "object"
						) {
							cf = meal.customFields as Record<string, unknown>;
						}
						const sourceUrl = cf?.sourceUrl;
						if (!sourceUrl || typeof sourceUrl !== "string") return null;
						try {
							return (
								<a
									href={sourceUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-muted hover:text-hyper-green transition-colors truncate block mb-2"
									onClick={(e) => e.stopPropagation()}
								>
									via {new URL(sourceUrl).hostname}
								</a>
							);
						} catch {
							return null;
						}
					})()}

					<div className="flex justify-between items-end mt-4">
						<div className="text-sm text-muted">
							<div>Servings: {meal.servings}</div>
							<div>Ingredients: {meal.ingredients?.length || 0}</div>
						</div>
					</div>
				</StandardCard>
			</div>

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
