import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { CargoEditModal } from "~/components/cargo/CargoEditModal";
import { ActionMenu } from "~/components/hud/ActionMenu";
import { Toast } from "~/components/shell/Toast";
import type { cargo } from "~/db/schema";
import { useToast } from "~/hooks/useToast";

interface CargoListRowProps {
	item: typeof cargo.$inferSelect;
	isPromoted?: boolean;
	onUpgradeRequired?: () => void;
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
	const msPerDay = 1000 * 60 * 60 * 24;
	const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / msPerDay;
	if (daysUntilExpiry < 0) return "biohazard";
	if (daysUntilExpiry < 3) return "decay_imminent";
	return "stable";
}

function formatExpiry(expiresAt?: Date | null): string {
	if (!expiresAt) return "No expiry";
	const msPerDay = 1000 * 60 * 60 * 24;
	const days = Math.round((expiresAt.getTime() - Date.now()) / msPerDay);
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
	onUpgradeRequired,
}: CargoListRowProps) {
	const fetcher = useFetcher<{
		success?: boolean;
		error?: string;
		provisionId?: string;
		alreadyExisted?: boolean;
	}>();
	const [isEditing, setIsEditing] = useState(false);
	const [isPromoted, setIsPromoted] = useState(initialIsPromoted);
	const [promotedId, setPromotedId] = useState<string | null>(null);

	const successToast = useToast({ duration: 4000 });
	const alreadyToast = useToast({ duration: 3000 });

	const currentIntent = fetcher.formData?.get("intent") as string | null;
	const isDeleting = fetcher.state !== "idle" && currentIntent === "delete";
	const isUpdating = fetcher.state !== "idle" && currentIntent === "update";
	const isPromoting = fetcher.state !== "idle" && currentIntent === "promote";
	const [lastIntent, setLastIntent] = useState<string | null>(null);

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

	const tags =
		typeof item.tags === "string" ? JSON.parse(item.tags) : item.tags || [];

	const parsedExpiry = parseDate(item.expiresAt);
	const statusColor = getStatusColor(item.status, parsedExpiry);
	const expiryLabel = formatExpiry(parsedExpiry);
	const visibleTags = (tags as string[]).slice(0, 2);
	const extraTagCount = Math.max(0, (tags as string[]).length - 2);

	const handleDelete = () => {
		fetcher.submit({ intent: "delete", itemId: item.id }, { method: "post" });
	};

	const handlePromote = () => {
		if (isPromoted || isPromoting) return;
		fetcher.submit({ intent: "promote", itemId: item.id }, { method: "post" });
	};

	if (isDeleting) return null;

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

			<div className="flex items-center gap-2 py-3 min-h-[48px] group overflow-hidden">
				{/* Status dot */}
				<span
					className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`}
					aria-hidden="true"
				/>

				{/* Name — opens ingredient details */}
				<Link to={`/hub/cargo/${item.id}`} className="flex-1 text-left min-w-0">
					<span
						className="text-sm font-semibold text-carbon dark:text-white truncate block group-hover:text-hyper-green transition-colors"
						title={item.name}
					>
						{item.name}
					</span>
				</Link>

				{/* Tags (up to 2, hidden on very small screens) */}
				<div className="hidden sm:flex items-center gap-1 shrink-0">
					{visibleTags.map((tag: string) => (
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

				{/* Expiry */}
				<span
					className={`hidden sm:inline text-xs font-medium shrink-0 w-12 text-right ${
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
				<span className="text-sm font-bold text-carbon dark:text-white shrink-0 w-16 text-right">
					{item.quantity}
					<span className="text-xs font-normal text-muted ml-1">
						{item.unit}
					</span>
				</span>

				{/* Promoted badge (desktop) */}
				{isPromoted && (
					<span className="hidden md:inline text-xs px-2 py-0.5 bg-hyper-green/15 text-hyper-green rounded-full font-medium shrink-0">
						In Galley
					</span>
				)}

				{/* Action menu — always visible */}
				<div className="shrink-0">
					<ActionMenu
						actions={[
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
					tags={tags}
					onClose={() => setIsEditing(false)}
					fetcher={fetcher}
					isUpdating={isUpdating}
				/>
			)}
		</>
	);
}
