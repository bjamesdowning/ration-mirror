import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { MealEditModal } from "~/components/galley/MealEditModal";
import { ProvisionEditModal } from "~/components/galley/ProvisionEditModal";
import { ActionMenu } from "~/components/hud/ActionMenu";
import { CheckIcon, PlusIcon } from "~/components/icons/PageIcons";
import type { meal } from "~/db/schema";
import type { MealCustomFields } from "~/lib/types";

type InventoryItem = {
	id: string;
	name: string;
	unit: string;
	quantity: number;
};

interface MealListRowProps {
	meal: typeof meal.$inferSelect & {
		type?: string;
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
	detailHref?: string;
}

export function MealListRow({
	meal,
	availableIngredients = [],
	isActive = false,
	onToggleActive,
	detailHref,
}: MealListRowProps) {
	const fetcher = useFetcher();
	const toggleFetcher = useFetcher<{
		success: boolean;
		mealId: string;
		isActive: boolean;
	}>();
	const [isEditing, setIsEditing] = useState(false);
	const [localActive, setLocalActive] = useState(isActive);

	const isDeleting =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";
	const isUpdating =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "update";
	const isToggling = toggleFetcher.state !== "idle";

	const isProvision = meal.type === "provision";
	const tags = meal.tags ?? [];
	const visibleTags = tags.slice(0, 2);
	const extraTagCount = Math.max(0, tags.length - 2);

	useEffect(() => {
		setLocalActive(isActive);
	}, [isActive]);

	useEffect(() => {
		if (!toggleFetcher.data?.mealId) return;
		if (toggleFetcher.data.mealId !== meal.id) return;
		setLocalActive(toggleFetcher.data.isActive);
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

	// For provision type, derive quantity label
	const singleIngredient = isProvision ? meal.ingredients?.[0] : null;
	const quantityLabel = singleIngredient
		? `${singleIngredient.quantity} ${singleIngredient.unit}`
		: null;

	return (
		<>
			<div className="flex items-center gap-3 py-3 px-1 min-h-[48px] group">
				{/* Supply list toggle */}
				<button
					type="button"
					onClick={handleToggleActive}
					disabled={isToggling}
					aria-pressed={localActive}
					title={
						localActive ? "Selected for Supply list" : "Add to Supply list"
					}
					className={`flex items-center justify-center min-w-[44px] min-h-[44px] border rounded text-xs font-bold transition-all shrink-0 ${
						localActive
							? "bg-hyper-green text-carbon border-hyper-green"
							: "bg-platinum/70 dark:bg-white/5 text-muted border-carbon/20 hover:bg-platinum"
					}`}
				>
					{localActive ? (
						<CheckIcon className="w-3 h-3" />
					) : (
						<PlusIcon className="w-3 h-3" />
					)}
				</button>

				{/* Name — tappable to open detail or edit */}
				<button
					type="button"
					onClick={() => setIsEditing(true)}
					className="flex-1 text-left min-w-0"
				>
					<span
						className="text-sm font-semibold text-carbon dark:text-white truncate block group-hover:text-hyper-green transition-colors capitalize"
						title={meal.name}
					>
						{meal.name}
					</span>
					{isProvision && quantityLabel && (
						<span className="text-xs text-muted block">{quantityLabel}</span>
					)}
				</button>

				{/* Tags (up to 2, hidden on very small screens) */}
				<div className="hidden sm:flex items-center gap-1 shrink-0">
					{visibleTags.map((tag) => (
						<span
							key={tag}
							className="text-xs px-1.5 py-0.5 bg-hyper-green/10 text-hyper-green rounded"
						>
							{tag}
						</span>
					))}
					{extraTagCount > 0 && (
						<span className="text-xs text-muted">+{extraTagCount}</span>
					)}
				</div>

				{/* Recipe-specific metadata */}
				{!isProvision && (
					<>
						<span className="text-xs text-muted shrink-0 hidden md:block w-20 text-right">
							{meal.ingredients?.length ?? 0} ingredients
						</span>
						<span className="text-xs font-medium text-carbon dark:text-white shrink-0 w-12 text-right">
							{meal.prepTime ? `${meal.prepTime}m` : "--"}
						</span>
					</>
				)}

				{/* Provision type label */}
				{isProvision && (
					<span className="text-xs text-muted shrink-0 hidden md:block">
						Single item
					</span>
				)}

				{/* Action menu */}
				<div className="shrink-0">
					<ActionMenu
						actions={[
							{ label: "View", to: detailHref ?? `/hub/galley/${meal.id}` },
							{ label: "Edit", onClick: () => setIsEditing(true) },
							{ label: "Delete", onClick: handleDelete, destructive: true },
						]}
					/>
				</div>
			</div>

			{isEditing &&
				(isProvision ? (
					<ProvisionEditModal
						meal={meal}
						onClose={() => setIsEditing(false)}
						fetcher={fetcher}
					/>
				) : (
					<MealEditModal
						meal={meal}
						availableIngredients={availableIngredients}
						onClose={() => setIsEditing(false)}
						fetcher={fetcher}
						isUpdating={isUpdating}
					/>
				))}
		</>
	);
}
