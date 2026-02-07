import { useState } from "react";
import { useFetcher } from "react-router";
import { InventoryEditModal } from "~/components/cargo/InventoryEditModal";
import { StatusGauge } from "~/components/cargo/StatusGauge";
import { StandardCard } from "~/components/common/StandardCard";
import type { inventory } from "~/db/schema";
import { formatInventoryStatus } from "~/lib/inventory";

export function InventoryCard({
	item,
}: {
	item: typeof inventory.$inferSelect;
}) {
	const fetcher = useFetcher();
	const [isEditing, setIsEditing] = useState(false);
	const isDeleting =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";
	const isUpdating =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "update";

	// Close modal on successful update
	if (isEditing && fetcher.state === "idle" && fetcher.data?.success) {
		setIsEditing(false);
	}

	// Parse tags safely
	const tags =
		typeof item.tags === "string" ? JSON.parse(item.tags) : item.tags || [];

	if (isDeleting) {
		return null;
	}

	const handleDelete = () => {
		fetcher.submit({ intent: "delete", itemId: item.id }, { method: "post" });
	};

	return (
		<>
			<StandardCard
				actions={[
					{
						label: "View",
						onClick: () => setIsEditing(true),
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
					<div className="min-w-0">
						<h3
							className="text-lg font-bold text-carbon truncate mr-2"
							title={item.name}
						>
							{item.name}
						</h3>
						<p className="text-label text-muted">{/* Category removed */}</p>
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
					<span className="text-carbon">
						{formatInventoryStatus(item.status)}
					</span>
				</div>
			</StandardCard>

			{isEditing && (
				<InventoryEditModal
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
