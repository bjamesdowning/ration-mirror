import { useEffect, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { CargoEditModal } from "~/components/cargo/CargoEditModal";
import { RestockQuantityModal } from "~/components/cargo/RestockQuantityModal";
import { ActionMenu } from "~/components/hud/ActionMenu";
import { DisplayQuantity } from "~/components/shared/DisplayQuantity";
import { TagChip } from "~/components/shared/TagChip";
import { Toast } from "~/components/shell/Toast";
import type { cargo } from "~/db/schema";
import { useToast } from "~/hooks/useToast";
import {
	calculateInventoryStatus,
	computeDaysUntilExpiry,
} from "~/lib/cargo-utils";
import type { TagRecord } from "~/lib/tags";
import { toSupportedUnit } from "~/lib/units";

type CargoWithTags = typeof cargo.$inferSelect & { tags: TagRecord[] };

interface CargoListRowProps {
	item: CargoWithTags;
	isPromoted?: boolean;
	isActive?: boolean;
	onToggleRestock?: (cargoId: string, nextActive: boolean) => void;
	onUpgradeRequired?: () => void;
	onTagClick?: (slug: string) => void;
	tagSuggestions?: string[];
	detailHref?: string;
}

function parseDate(value?: Date | string | null) {
	if (!value) return null;
	if (value instanceof Date) return value;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getStatusColor(status?: string | null, expiresAt?: Date | null) {
	const resolved = status ?? inferStatus(expiresAt);
	if (resolved === "biohazard") return "bg-danger";
	if (resolved === "decay_imminent") return "bg-warning";
	return "bg-hyper-green";
}

function inferStatus(expiresAt?: Date | null) {
	if (!expiresAt) return "stable";
	return calculateInventoryStatus(expiresAt);
}

function formatExpiry(expiresAt?: Date | null): string {
	if (!expiresAt) return "No expiry";
	const days = computeDaysUntilExpiry(expiresAt);
	if (days < 0) return "Expired";
	if (days === 0) return "Today";
	if (days === 1) return "1d";
	if (days < 30) return `${days}d`;
	return expiresAt.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

export function CargoListRow({
	item,
	isPromoted: initialIsPromoted = false,
	isActive = false,
	onToggleRestock,
	onUpgradeRequired,
	onTagClick,
	tagSuggestions = [],
	detailHref,
}: CargoListRowProps) {
	const navigate = useNavigate();
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

	const successToast = useToast({ duration: 4000 });
	const alreadyToast = useToast({ duration: 3000 });

	const currentIntent = fetcher.formData?.get("intent") as string | null;
	const isDeleting = fetcher.state !== "idle" && currentIntent === "delete";
	const isUpdating = fetcher.state !== "idle" && currentIntent === "update";
	const isPromoting = fetcher.state !== "idle" && currentIntent === "promote";
	const [lastIntent, setLastIntent] = useState<string | null>(null);
	const [showRestockModal, setShowRestockModal] = useState(false);

	useEffect(() => {
		if (fetcher.state !== "idle" && currentIntent) {
			setLastIntent(currentIntent);
		}
	}, [fetcher.state, currentIntent]);

	useEffect(() => {
		if (fetcher.state !== "idle" || lastIntent !== "promote") return;
		const fetcherData = fetcher.data;
		if (!fetcherData) return;

		if (fetcherData.success) {
			setIsPromoted(true);
			if (fetcherData.provisionId) setPromotedId(fetcherData.provisionId);
			if (fetcherData.alreadyExisted) {
				alreadyToast.show();
			} else {
				successToast.show();
			}
		} else if (fetcherData.error === "capacity_exceeded") {
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

	const tags = item.tags ?? [];
	const parsedExpiry = parseDate(item.expiresAt);
	const statusColor = getStatusColor(item.status, parsedExpiry);
	const expiryLabel = formatExpiry(parsedExpiry);
	const visibleTags = tags.slice(0, 2);
	const extraTagCount = Math.max(0, tags.length - 2);

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

	if (isDeleting) return null;

	const detailPath = detailHref ?? `/hub/cargo/${item.id}`;

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

			<div className="relative flex items-center gap-2 py-3 min-h-[48px] group overflow-hidden">
				<button
					type="button"
					className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-green"
					onClick={(event) => {
						if ((event.target as HTMLElement).closest("[data-row-action]"))
							return;
						navigate(detailPath);
					}}
					aria-label={`View ${item.name}`}
				/>

				{/* Status dot */}
				<span
					className={`relative z-10 w-2 h-2 rounded-full shrink-0 ${statusColor}`}
					aria-hidden="true"
				/>

				{/* Name */}
				<span
					className="relative z-10 flex-1 text-left min-w-0 text-sm font-semibold text-carbon dark:text-white truncate group-hover:text-hyper-green transition-colors"
					title={item.name}
				>
					{item.name}
				</span>

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

				{/* Expiry */}
				<span
					className={`relative z-10 hidden sm:inline text-xs font-medium shrink-0 w-12 text-right ${
						parsedExpiry &&
						(
							inferStatus(parsedExpiry) === "biohazard" ||
								inferStatus(parsedExpiry) === "decay_imminent"
						)
							? "text-danger"
							: "text-muted"
					}`}
				>
					{expiryLabel}
				</span>

				{/* Qty + Unit */}
				<span className="relative z-10 text-sm font-bold text-carbon dark:text-white shrink-0 min-w-16 text-right">
					<DisplayQuantity
						quantity={item.quantity}
						unit={item.unit}
						baseQuantity={item.baseQuantity}
						baseUnit={item.baseUnit}
						ingredientName={item.name}
					/>
				</span>

				{/* Promoted badge (desktop) */}
				{isPromoted && (
					<span className="relative z-10 hidden md:inline text-xs px-2 py-0.5 bg-hyper-green/15 text-hyper-green rounded-full font-medium shrink-0">
						In Galley
					</span>
				)}
				{localActive && (
					<span className="relative z-10 hidden md:inline text-xs px-2 py-0.5 bg-hyper-green/15 text-hyper-green rounded-full font-medium shrink-0">
						On Supply
					</span>
				)}

				{/* Action menu — always visible */}
				<div className="relative z-20 shrink-0" data-row-action>
					<ActionMenu
						actions={[
							{
								label: localActive
									? "Remove from Supply list"
									: "Add to Supply list",
								onClick: handleToggleRestock,
							},
							{
								label: "Edit",
								onClick: () => setIsEditing(true),
							},
							{
								label: isPromoted
									? "In Galley"
									: isPromoting
										? "Adding..."
										: "Add to Galley",
								onClick: handlePromote,
							},
							{
								label: "Delete",
								onClick: handleDelete,
								destructive: true,
							},
						]}
					/>
				</div>
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
					isPending={restockFetcher.state !== "idle"}
				/>
			)}
		</>
	);
}
