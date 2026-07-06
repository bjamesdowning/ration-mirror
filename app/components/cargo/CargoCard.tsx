import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { CargoEditModal } from "~/components/cargo/CargoEditModal";
import { RestockQuantityModal } from "~/components/cargo/RestockQuantityModal";
import { StatusGauge } from "~/components/cargo/StatusGauge";
import { StandardCard } from "~/components/common/StandardCard";
import { CheckIcon, PlusIcon } from "~/components/icons/PageIcons";
import { DisplayQuantity } from "~/components/shared/DisplayQuantity";
import { TagChip } from "~/components/shared/TagChip";
import { Toast } from "~/components/shell/Toast";
import type { cargo } from "~/db/schema";
import { useToast } from "~/hooks/useToast";
import { formatCargoStatus } from "~/lib/cargo";
import type { TagRecord } from "~/lib/tags";
import { toSupportedUnit } from "~/lib/units";

type CargoWithTags = typeof cargo.$inferSelect & { tags: TagRecord[] };

interface CargoCardProps {
	item: CargoWithTags;
	isPromoted?: boolean;
	isActive?: boolean;
	onToggleRestock?: (cargoId: string, nextActive: boolean) => void;
	onUpgradeRequired?: () => void;
	onTagClick?: (slug: string) => void;
	tagSuggestions?: string[];
	detailHref?: string;
}

export function CargoCard({
	item,
	isPromoted: initialIsPromoted = false,
	isActive = false,
	onToggleRestock,
	onUpgradeRequired,
	onTagClick,
	tagSuggestions = [],
	detailHref,
}: CargoCardProps) {
	const fetcher = useFetcher<{
		success?: boolean;
		error?: string;
		provisionId?: string;
		alreadyExisted?: boolean;
	}>();
	const restockFetcher = useFetcher<{
		success: boolean;
		cargoId: string;
		isActive: boolean;
	}>();
	const [isEditing, setIsEditing] = useState(false);
	const [isPromoted, setIsPromoted] = useState(initialIsPromoted);
	const [localActive, setLocalActive] = useState(isActive);
	const [promotedId, setPromotedId] = useState<string | null>(null);
	const [lastIntent, setLastIntent] = useState<string | null>(null);
	const [showRestockModal, setShowRestockModal] = useState(false);

	const successToast = useToast({ duration: 4000 });
	const alreadyToast = useToast({ duration: 3000 });

	const currentIntent = fetcher.formData?.get("intent") as string | null;
	const isDeleting = fetcher.state !== "idle" && currentIntent === "delete";
	const isUpdating = fetcher.state !== "idle" && currentIntent === "update";
	const isPromoting = fetcher.state !== "idle" && currentIntent === "promote";
	const isTogglingRestock = restockFetcher.state !== "idle";

	const tags = item.tags ?? [];

	// Track the intent while the request is in flight so we can read it on completion
	useEffect(() => {
		if (fetcher.state !== "idle" && currentIntent) {
			setLastIntent(currentIntent);
		}
	}, [fetcher.state, currentIntent]);

	// Close modal on successful update
	useEffect(() => {
		if (isEditing && fetcher.state === "idle" && fetcher.data?.success) {
			setIsEditing(false);
		}
	}, [isEditing, fetcher.state, fetcher.data?.success]);

	// Handle promote result
	useEffect(() => {
		if (fetcher.state !== "idle" || lastIntent !== "promote") return;
		const data = fetcher.data;
		if (!data) return;

		if (data.success) {
			setIsPromoted(true);
			if (data.provisionId) setPromotedId(data.provisionId);
			if (data.alreadyExisted) {
				alreadyToast.show();
			} else {
				successToast.show();
			}
		} else if (data.error === "capacity_exceeded") {
			onUpgradeRequired?.();
		}
		setLastIntent(null);
	}, [
		fetcher.state,
		fetcher.data,
		lastIntent,
		onUpgradeRequired,
		successToast.show,
		alreadyToast.show,
	]);

	// Keep isPromoted in sync if prop changes (e.g. revalidation)
	useEffect(() => {
		setIsPromoted(initialIsPromoted);
	}, [initialIsPromoted]);

	useEffect(() => {
		setLocalActive(isActive);
	}, [isActive]);

	useEffect(() => {
		if (!restockFetcher.data?.cargoId) return;
		if (restockFetcher.data.cargoId !== item.id) return;
		setLocalActive(restockFetcher.data.isActive);
	}, [restockFetcher.data, item.id]);

	if (isDeleting) {
		return null;
	}

	const handleDelete = () => {
		fetcher.submit({ intent: "delete", itemId: item.id }, { method: "post" });
	};

	const handlePromote = () => {
		if (isPromoted || isPromoting) return;
		fetcher.submit({ intent: "promote", itemId: item.id }, { method: "post" });
	};

	const handleToggleRestock = () => {
		if (localActive) {
			setLocalActive(false);
			onToggleRestock?.(item.id, false);
			restockFetcher.submit(null, {
				method: "post",
				action: `/api/cargo/${item.id}/toggle-restock`,
			});
			return;
		}
		setShowRestockModal(true);
	};

	const handleRestockConfirm = (quantity: number) => {
		setShowRestockModal(false);
		setLocalActive(true);
		onToggleRestock?.(item.id, true);
		restockFetcher.submit(JSON.stringify({ quantity }), {
			method: "post",
			action: `/api/cargo/${item.id}/toggle-restock`,
			encType: "application/json",
		});
	};

	const restockAction = {
		label: localActive ? "Remove from Supply list" : "Add to Supply list",
		onClick: handleToggleRestock,
	};
	const cardActions = [
		{ label: "Edit", onClick: () => setIsEditing(true) },
		{
			label: isPromoted
				? "In Galley"
				: isPromoting
					? "Adding..."
					: "Add to Galley",
			onClick: handlePromote,
		},
		{ label: "Delete", onClick: handleDelete, destructive: true },
	];

	return (
		<>
			{successToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					title="Added to Galley"
					description={
						promotedId ? (
							<Link to={`/hub/galley/${promotedId}`} className="underline">
								View in Galley
							</Link>
						) : undefined
					}
					onDismiss={successToast.hide}
				/>
			)}
			{alreadyToast.isOpen && (
				<Toast
					variant="info"
					position="bottom-right"
					title="Already in Galley"
					description={
						promotedId ? (
							<Link to={`/hub/galley/${promotedId}`} className="underline">
								View in Galley
							</Link>
						) : undefined
					}
					onDismiss={alreadyToast.hide}
				/>
			)}
			<div className="relative">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						handleToggleRestock();
					}}
					disabled={isTogglingRestock}
					aria-pressed={localActive}
					className={`hidden md:flex absolute top-4 left-4 z-40 items-center justify-center min-w-[44px] min-h-[44px] border text-xs font-bold transition-all shadow-sm ${
						localActive
							? "bg-hyper-green text-carbon border-hyper-green"
							: "bg-platinum/70 text-muted border-carbon/20 hover:bg-platinum"
					}`}
					title={
						localActive ? "Selected for Supply restock" : "Add to Supply list"
					}
				>
					{localActive ? (
						<CheckIcon className="w-3.5 h-3.5" />
					) : (
						<PlusIcon className="w-3.5 h-3.5" />
					)}
				</button>
				<StandardCard
					to={detailHref ?? `/hub/cargo/${item.id}`}
					actions={cardActions}
					mobileActions={[restockAction, ...cardActions]}
				>
					<div className="flex justify-between items-start mb-2">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2 flex-wrap">
								<div className="hidden md:block w-11 h-11 flex-shrink-0" />
								<span
									className="text-lg font-bold text-carbon truncate group-hover:text-hyper-green transition-colors"
									title={item.name}
								>
									{item.name}
								</span>
								{isPromoted && (
									<span className="shrink-0 text-xs px-2 py-0.5 bg-hyper-green/15 text-hyper-green rounded-full font-medium">
										In Galley
									</span>
								)}
								{localActive && (
									<span className="shrink-0 text-xs px-2 py-0.5 bg-hyper-green/15 text-hyper-green rounded-full font-medium">
										On Supply
									</span>
								)}
							</div>
						</div>
						<div className="text-right">
							<DisplayQuantity
								quantity={item.quantity}
								unit={item.unit}
								baseQuantity={item.baseQuantity}
								baseUnit={item.baseUnit}
								ingredientName={item.name}
								className="text-xl font-bold text-data text-carbon"
							/>
						</div>
					</div>

					{tags.length > 0 && (
						<div className="flex flex-wrap gap-2 mb-4">
							{tags.map((tag) => (
								<TagChip
									key={tag.id}
									tag={tag}
									onClick={onTagClick}
									size="sm"
								/>
							))}
						</div>
					)}

					<StatusGauge status={item.status} expiresAt={item.expiresAt} />

					<div className="mt-3 flex justify-between text-sm text-muted">
						<span>Status</span>
						<span className="text-carbon">
							{formatCargoStatus(item.status)}
						</span>
					</div>
				</StandardCard>
			</div>

			{isEditing && (
				<CargoEditModal
					item={item}
					tagSlugs={tags.map((t) => t.slug)}
					tagSuggestions={tagSuggestions}
					onClose={() => setIsEditing(false)}
					fetcher={fetcher}
					isUpdating={isUpdating}
				/>
			)}
			{showRestockModal && (
				<RestockQuantityModal
					itemName={item.name}
					quantity={1}
					unit={toSupportedUnit(item.unit ?? "unit")}
					onConfirm={handleRestockConfirm}
					onCancel={() => setShowRestockModal(false)}
					isPending={isTogglingRestock}
				/>
			)}
		</>
	);
}
