import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { MealEditModal } from "~/components/galley/MealEditModal";
import { ProvisionEditModal } from "~/components/galley/ProvisionEditModal";
import { ActionMenu } from "~/components/hud/ActionMenu";
import { CheckIcon, PlusIcon } from "~/components/icons/PageIcons";
import { useQuantityFormatter } from "~/components/shared/DisplayQuantity";
import { TagChip } from "~/components/shared/TagChip";
import type { meal } from "~/db/schema";
import type { TagRecord } from "~/lib/tags";
import { toTagRecords } from "~/lib/tags";
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
		tags?: TagRecord[] | string[];
		ingredients?: {
			inventoryId?: string | null;
			ingredientName: string;
			quantity: number;
			unit: string;
			baseQuantity?: number | null;
			baseUnit?: string | null;
			isOptional?: boolean | null;
			orderIndex?: number | null;
		}[];
		equipment?: string[] | null;
		customFields?: string | MealCustomFields | null;
	};
	availableIngredients?: InventoryItem[];
	isActive?: boolean;
	onToggleActive?: (mealId: string, nextActive: boolean) => void;
	onTagClick?: (slug: string) => void;
	tagSuggestions?: string[];
	detailHref?: string;
}

export function MealListRow({
	meal,
	availableIngredients = [],
	isActive = false,
	onToggleActive,
	onTagClick,
	tagSuggestions = [],
	detailHref,
}: MealListRowProps) {
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const formatQty = useQuantityFormatter();
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
	const tags = toTagRecords(meal.tags);
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
		? formatQty(
				singleIngredient.quantity,
				singleIngredient.unit,
				singleIngredient.ingredientName,
				singleIngredient.baseQuantity ?? undefined,
				singleIngredient.baseUnit ?? undefined,
			).formatted
		: null;

	const detailPath = detailHref ?? `/hub/galley/${meal.id}`;
	const supplyAction = {
		label: localActive ? "Remove from Supply list" : "Add to Supply list",
		onClick: handleToggleActive,
	};
	const editAction = { label: "Edit", onClick: () => setIsEditing(true) };
	const deleteAction = {
		label: "Delete",
		onClick: handleDelete,
		destructive: true,
	};

	return (
		<>
			<div className="relative flex items-center gap-3 py-3 px-1 min-h-[48px] group">
				<button
					type="button"
					className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-green"
					onClick={(event) => {
						if ((event.target as HTMLElement).closest("[data-row-action]"))
							return;
						navigate(detailPath);
					}}
					aria-label={`View ${meal.name}`}
				/>

				{/* Supply list toggle — desktop only */}
				<button
					type="button"
					data-row-action
					onClick={handleToggleActive}
					disabled={isToggling}
					aria-pressed={localActive}
					title={
						localActive ? "Selected for Supply list" : "Add to Supply list"
					}
					className={`relative z-20 hidden md:flex items-center justify-center min-w-[44px] min-h-[44px] border rounded text-xs font-bold transition-all shrink-0 ${
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

				{/* Name */}
				<div className="relative z-10 flex-1 text-left min-w-0">
					<span
						className="text-sm font-semibold text-carbon dark:text-white truncate block group-hover:text-hyper-green transition-colors capitalize"
						title={meal.name}
					>
						{meal.name}
					</span>
					{isProvision && quantityLabel && (
						<span className="text-xs text-muted block">{quantityLabel}</span>
					)}
				</div>

				{/* Tags (up to 2, hidden on very small screens) */}
				<div
					className="relative z-20 hidden sm:flex items-center gap-1 shrink-0"
					data-row-action
				>
					{visibleTags.map((tag) => (
						<TagChip key={tag.id} tag={tag} onClick={onTagClick} size="sm" />
					))}
					{extraTagCount > 0 && (
						<span className="text-xs text-muted">+{extraTagCount}</span>
					)}
				</div>

				{/* Recipe-specific metadata */}
				{!isProvision && (
					<>
						<span className="relative z-10 text-xs text-muted shrink-0 hidden md:block w-20 text-right">
							{meal.ingredients?.length ?? 0} ingredients
						</span>
						<span className="relative z-10 text-xs font-medium text-carbon dark:text-white shrink-0 w-12 text-right hidden md:block">
							{meal.prepTime ? `${meal.prepTime}m` : "--"}
						</span>
					</>
				)}

				{/* Provision type label */}
				{isProvision && (
					<span className="relative z-10 text-xs text-muted shrink-0 hidden md:block">
						Single item
					</span>
				)}

				{/* Action menu */}
				<div className="relative z-20 shrink-0 md:hidden" data-row-action>
					<ActionMenu actions={[supplyAction, editAction, deleteAction]} />
				</div>
				<div className="relative z-20 shrink-0 hidden md:block" data-row-action>
					<ActionMenu actions={[editAction, deleteAction]} />
				</div>
			</div>

			{isEditing &&
				(isProvision ? (
					<ProvisionEditModal
						meal={meal}
						tagSuggestions={tagSuggestions}
						onClose={() => setIsEditing(false)}
						fetcher={fetcher}
					/>
				) : (
					<MealEditModal
						meal={meal}
						availableIngredients={availableIngredients}
						tagSuggestions={tagSuggestions}
						onClose={() => setIsEditing(false)}
						fetcher={fetcher}
						isUpdating={isUpdating}
					/>
				))}
		</>
	);
}
