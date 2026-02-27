import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { CargoEditModal } from "~/components/cargo/CargoEditModal";
import { StatusGauge } from "~/components/cargo/StatusGauge";
import { StandardCard } from "~/components/common/StandardCard";
import { Toast } from "~/components/shell/Toast";
import type { cargo } from "~/db/schema";
import { useToast } from "~/hooks/useToast";
import { formatCargoStatus } from "~/lib/cargo";

interface CargoCardProps {
	item: typeof cargo.$inferSelect;
	isPromoted?: boolean;
	onUpgradeRequired?: () => void;
}

export function CargoCard({
	item,
	isPromoted: initialIsPromoted = false,
	onUpgradeRequired,
}: CargoCardProps) {
	const fetcher = useFetcher<{
		success?: boolean;
		error?: string;
		provisionId?: string;
		alreadyExisted?: boolean;
	}>();
	const [isEditing, setIsEditing] = useState(false);
	const [isPromoted, setIsPromoted] = useState(initialIsPromoted);
	const [promotedId, setPromotedId] = useState<string | null>(null);
	const [lastIntent, setLastIntent] = useState<string | null>(null);

	const successToast = useToast({ duration: 4000 });
	const alreadyToast = useToast({ duration: 3000 });

	const currentIntent = fetcher.formData?.get("intent") as string | null;
	const isDeleting = fetcher.state !== "idle" && currentIntent === "delete";
	const isUpdating = fetcher.state !== "idle" && currentIntent === "update";
	const isPromoting = fetcher.state !== "idle" && currentIntent === "promote";

	// Track the intent while the request is in flight so we can read it on completion
	useEffect(() => {
		if (fetcher.state !== "idle" && currentIntent) {
			setLastIntent(currentIntent);
		}
	}, [fetcher.state, currentIntent]);

	// Close modal on successful update
	if (isEditing && fetcher.state === "idle" && fetcher.data?.success) {
		setIsEditing(false);
	}

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

	// Parse tags safely
	const tags =
		typeof item.tags === "string" ? JSON.parse(item.tags) : item.tags || [];

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
			<StandardCard
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
			>
				<div className="flex justify-between items-start mb-2">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 flex-wrap">
							<h3
								className="text-lg font-bold text-carbon truncate"
								title={item.name}
							>
								{item.name}
							</h3>
							{isPromoted && (
								<span className="shrink-0 text-xs px-2 py-0.5 bg-hyper-green/15 text-hyper-green rounded-full font-medium">
									In Galley
								</span>
							)}
						</div>
					</div>
					<div className="text-right">
						<span className="text-xl font-bold text-data text-carbon">
							{item.quantity}
						</span>
						<span className="text-sm ml-1 text-muted">{item.unit}</span>
					</div>
				</div>

				<div className="flex flex-wrap gap-2 mb-4">
					{tags.map((tag: string) => (
						<span
							key={tag}
							className="text-xs px-2 py-1 bg-hyper-green/10 text-hyper-green rounded-md"
						>
							{tag}
						</span>
					))}
				</div>

				<StatusGauge status={item.status} expiresAt={item.expiresAt} />

				<div className="mt-3 flex justify-between text-sm text-muted">
					<span>Status</span>
					<span className="text-carbon">{formatCargoStatus(item.status)}</span>
				</div>
			</StandardCard>

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
