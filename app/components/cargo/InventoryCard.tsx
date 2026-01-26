import { useState } from "react";
import { useFetcher } from "react-router";
import { InventoryEditModal } from "~/components/cargo/InventoryEditModal";
import { StatusGauge } from "~/components/cargo/StatusGauge";
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

	return (
		<>
			<div className="relative group p-4 border border-[#39FF14] bg-[#051105]/90 font-mono text-[#39FF14] hover:bg-[#0a220a] transition-colors">
				<div className="flex justify-between items-start mb-2">
					<div className="min-w-0">
						<h3
							className="text-lg font-bold uppercase tracking-wider truncate mr-2"
							title={item.name}
						>
							{item.name}
						</h3>
						<p className="text-[10px] uppercase opacity-60 tracking-widest">
							{formatInventoryCategory(item.category)}
						</p>
					</div>
					<div className="text-right">
						<span className="text-xl font-bold">{item.quantity}</span>
						<span className="text-xs ml-1 opacity-70">{item.unit}</span>
					</div>
				</div>

				<div className="flex flex-wrap gap-2 mb-4">
					{tags.map((tag: string) => (
						<span
							key={tag}
							className="text-[10px] px-1 py-0.5 border border-[#39FF14]/50 opacity-80 uppercase"
						>
							{tag}
						</span>
					))}
				</div>

				<StatusGauge status={item.status} expiresAt={item.expiresAt} />

				<div className="mt-3 flex justify-between text-[10px] uppercase opacity-60">
					<span>Status</span>
					<span>{formatInventoryStatus(item.status)}</span>
				</div>

				<div className="absolute -top-12 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
					<button
						type="button"
						onClick={() => setIsEditing(true)}
						className="text-[#39FF14] hover:text-[#2bff00] bg-black/90 px-2 py-1 text-xs border border-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.3)] uppercase font-bold tracking-wider"
					>
						[MODIFY]
					</button>
					<fetcher.Form method="post">
						<input type="hidden" name="intent" value="delete" />
						<input type="hidden" name="itemId" value={item.id} />
						<button
							type="submit"
							className="text-red-500 hover:text-red-400 bg-black/90 px-2 py-1 text-xs border border-red-500 shadow-[0_0_10px_rgba(255,0,0,0.3)] uppercase font-bold tracking-wider"
						>
							[JETTISON]
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
