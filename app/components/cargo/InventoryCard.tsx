import { useState } from "react";
import { useFetcher } from "react-router";
import { InventoryEditModal } from "~/components/cargo/InventoryEditModal";
import { StatusGauge } from "~/components/cargo/StatusGauge";
import { ActionMenu } from "~/components/hud/ActionMenu";
import type { inventory } from "~/db/schema";
import {
	formatInventoryCategory,
	formatInventoryStatus,
} from "~/lib/inventory";

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
			<div className="relative group glass-panel rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
				{/* Mobile Action Menu */}
				<div className="md:hidden absolute top-2 right-2 z-20">
					<ActionMenu
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
					/>
				</div>

				<div className="flex justify-between items-start mb-2">
					<div className="min-w-0">
						<h3
							className="text-lg font-bold text-carbon truncate mr-2"
							title={item.name}
						>
							{item.name}
						</h3>
						<p className="text-label text-muted">
							{formatInventoryCategory(item.category)}
						</p>
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

				{/* Desktop Hover Overlay */}
				<div className="absolute inset-0 bg-carbon/60 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-3 backdrop-blur-[2px] rounded-xl z-10 hidden md:flex">
					<button
						type="button"
						onClick={() => setIsEditing(true)}
						className="bg-platinum text-carbon font-bold px-4 py-2 rounded-lg hover:bg-white transition-all shadow-lg text-sm"
					>
						View
					</button>
					<button
						type="button"
						onClick={() => setIsEditing(true)}
						className="bg-hyper-green text-carbon font-bold px-4 py-2 rounded-lg hover:shadow-glow transition-all shadow-lg text-sm"
					>
						Edit
					</button>
					<fetcher.Form method="post" onSubmit={(e) => e.stopPropagation()}>
						<input type="hidden" name="intent" value="delete" />
						<input type="hidden" name="itemId" value={item.id} />
						<button
							type="submit"
							className="bg-danger text-white font-bold px-4 py-2 rounded-lg hover:bg-danger/90 transition-all shadow-lg text-sm"
						>
							Delete
						</button>
					</fetcher.Form>
				</div>
			</div>

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
