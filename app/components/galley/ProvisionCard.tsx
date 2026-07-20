import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { StandardCard } from "~/components/common/StandardCard";
import { CheckIcon, PlusIcon } from "~/components/icons/PageIcons";
import { useQuantityFormatter } from "~/components/shared/DisplayQuantity";
import { TagChip } from "~/components/shared/TagChip";
import type { meal } from "~/db/schema";
import { DOMAIN_ICONS, DOMAIN_LABELS } from "~/lib/domain";
import type { TagRecord } from "~/lib/tags";
import { toTagRecords } from "~/lib/tags";
import { ProvisionEditModal } from "./ProvisionEditModal";

interface ProvisionCardProps {
	meal: typeof meal.$inferSelect & {
		tags?: TagRecord[] | string[];
		ingredients?: {
			ingredientName: string;
			quantity: number;
			unit: string;
			baseQuantity?: number | null;
			baseUnit?: string | null;
		}[];
	};
	isActive?: boolean;
	onToggleActive?: (mealId: string, nextActive: boolean) => void;
	onTagClick?: (slug: string) => void;
	tagSuggestions?: string[];
	detailHref?: string;
}

export function ProvisionCard({
	meal,
	isActive = false,
	onToggleActive,
	onTagClick,
	tagSuggestions = [],
	detailHref,
}: ProvisionCardProps) {
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
	const isToggling = toggleFetcher.state !== "idle";

	useEffect(() => {
		setLocalActive(isActive);
	}, [isActive]);

	useEffect(() => {
		if (!toggleFetcher.data?.mealId) return;
		if (toggleFetcher.data.mealId !== meal.id) return;
		setLocalActive(toggleFetcher.data.isActive);
	}, [toggleFetcher.data, meal.id]);

	const displayTags = toTagRecords(meal.tags);

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

	const supplyAction = {
		label: localActive ? "Remove from Supply list" : "Add to Supply list",
		onClick: handleToggleActive,
	};
	const cardActions = [
		{ label: "Edit", onClick: () => setIsEditing(true) },
		{ label: "Delete", onClick: handleDelete, destructive: true },
	];

	const singleIngredient = meal.ingredients?.[0];
	const quantityLabel = singleIngredient
		? formatQty(
				singleIngredient.quantity,
				singleIngredient.unit,
				singleIngredient.ingredientName,
				singleIngredient.baseQuantity ?? undefined,
				singleIngredient.baseUnit ?? undefined,
			).formatted
		: "—";
	const DomainIcon = meal.domain
		? DOMAIN_ICONS[meal.domain as keyof typeof DOMAIN_ICONS]
		: null;
	const domainLabel = meal.domain
		? DOMAIN_LABELS[meal.domain as keyof typeof DOMAIN_LABELS]
		: "Food";

	return (
		<>
			<div className="relative">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						handleToggleActive();
					}}
					disabled={isToggling}
					aria-pressed={localActive}
					className={`hidden md:flex absolute top-4 left-4 z-40 items-center justify-center min-w-[44px] min-h-[44px] border text-xs font-bold transition-all shadow-sm ${
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
					to={detailHref ?? `/hub/galley/${meal.id}`}
					actions={cardActions}
					mobileActions={[supplyAction, ...cardActions]}
				>
					<div className="flex justify-between items-start mb-2">
						<div className="flex items-start gap-2 min-w-0">
							<div className="hidden md:block w-11 h-11 flex-shrink-0" />
							<h3
								className="text-lg font-bold text-carbon group-hover:text-hyper-green transition-colors truncate mr-2 capitalize"
								title={meal.name}
							>
								{meal.name}
							</h3>
						</div>
						<div className="text-right flex items-center gap-1.5">
							{DomainIcon && (
								<span
									className="text-muted"
									title={domainLabel}
									role="img"
									aria-label={domainLabel}
								>
									<DomainIcon className="w-4 h-4" />
								</span>
							)}
							<span className="text-data text-sm font-bold text-carbon font-mono">
								{quantityLabel}
							</span>
						</div>
					</div>

					<div className="flex flex-wrap gap-2 mb-2">
						{displayTags.map((tag) => (
							<TagChip key={tag.id} tag={tag} onClick={onTagClick} size="sm" />
						))}
					</div>

					<div className="text-xs text-muted mt-2">Single item</div>
				</StandardCard>
			</div>

			{isEditing && (
				<ProvisionEditModal
					meal={meal}
					tagSuggestions={tagSuggestions}
					onClose={() => setIsEditing(false)}
					fetcher={fetcher}
				/>
			)}
		</>
	);
}
