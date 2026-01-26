// @ts-nocheck

import { useState } from "react";
import { useFetcher } from "react-router";
import type { inventory } from "~/db/schema";

interface ManifestGridProps {
	items: (typeof inventory.$inferSelect)[];
}

export function ManifestGrid({ items }: ManifestGridProps) {
	if (items.length === 0) {
		return (
			<div className="p-8 border border-dashed border-[#39FF14]/30 text-center text-[#39FF14]/50 font-mono uppercase">
				<p>Cargo Hold Empty</p>
				<p className="text-sm mt-2">Initiate Ingest Sequence</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{items.map((item) => (
				<InventoryCard key={item.id} item={item} />
			))}
		</div>
	);
}

function InventoryCard({ item }: { item: typeof inventory.$inferSelect }) {
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

	// Mock integrity based on expiresAt
	const daysUntilExpiry = item.expiresAt
		? Math.ceil(
				(new Date(item.expiresAt).getTime() - Date.now()) /
					(1000 * 60 * 60 * 24),
			)
		: 100;

	const integrity = Math.max(0, Math.min(100, daysUntilExpiry));

	let integrityColor = "bg-[#39FF14]";
	if (integrity < 3) integrityColor = "bg-red-500";
	else if (integrity < 7) integrityColor = "bg-yellow-500";

	// Parse tags safely
	const tags =
		typeof item.tags === "string" ? JSON.parse(item.tags) : item.tags || [];

	// Hide if deleting (Optimistic UI)
	if (isDeleting) {
		return null;
	}

	return (
		<>
			<div className="relative group p-4 border border-[#39FF14] bg-[#051105]/90 font-mono text-[#39FF14] hover:bg-[#0a220a] transition-colors">
				{/* Header: Name & Qty */}
				<div className="flex justify-between items-start mb-2">
					<h3
						className="text-lg font-bold uppercase tracking-wider truncate mr-2"
						title={item.name}
					>
						{item.name}
					</h3>
					<div className="text-right">
						<span className="text-xl font-bold">{item.quantity}</span>
						<span className="text-xs ml-1 opacity-70">{item.unit}</span>
					</div>
				</div>

				{/* Tags */}
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

				{/* Footer: Integrity & Actions */}
				<div className="mt-auto relative">
					<div className="flex justify-between text-[10px] uppercase opacity-70 mb-1">
						<span>Integrity</span>
						<span>
							{item.expiresAt
								? new Date(item.expiresAt).toLocaleDateString()
								: "STABLE"}
						</span>
					</div>
					<div className="h-1 w-full bg-[#39FF14]/20">
						<div
							className={`h-full ${integrityColor} transition-all duration-500`}
							style={{
								width: `${item.expiresAt ? Math.min(100, Math.max(0, (daysUntilExpiry / 30) * 100)) : 100}%`,
							}}
						/>
					</div>

					{/* Actions */}
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
			</div>

			{/* Edit Modal */}
			{isEditing && (
				<EditModal
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

function EditModal({
	item,
	tags,
	onClose,
	fetcher,
	isUpdating,
}: {
	item: typeof inventory.$inferSelect;
	tags: string[];
	onClose: () => void;
	fetcher: ReturnType<typeof useFetcher>;
	isUpdating: boolean;
}) {
	return (
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 font-mono">
			<div className="bg-[#051105] border border-[#39FF14] p-6 max-w-md w-full mx-4 shadow-[0_0_30px_rgba(57,255,20,0.3)]">
				<div className="flex justify-between items-center mb-6">
					<h2 className="text-[#39FF14] uppercase text-lg tracking-widest">
						Modify Cargo
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-[#39FF14]/50 hover:text-[#39FF14] text-xl"
					>
						×
					</button>
				</div>

				<fetcher.Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value="update" />
					<input type="hidden" name="itemId" value={item.id} />

					<div className="flex flex-col gap-2">
						<label
							htmlFor={`name-${item.id}`}
							className="text-xs uppercase opacity-70 text-[#39FF14]"
						>
							Designation
						</label>
						<input
							type="text"
							name="name"
							id={`name-${item.id}`}
							defaultValue={item.name}
							required
							className="bg-transparent border-b border-[#39FF14]/50 p-2 text-[#39FF14] focus:outline-none focus:border-[#39FF14]"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="flex flex-col gap-2">
							<label
								htmlFor={`quantity-${item.id}`}
								className="text-xs uppercase opacity-70 text-[#39FF14]"
							>
								Quantity
							</label>
							<input
								type="number"
								name="quantity"
								id={`quantity-${item.id}`}
								defaultValue={item.quantity}
								min={0}
								required
								className="bg-transparent border-b border-[#39FF14]/50 p-2 text-[#39FF14] focus:outline-none focus:border-[#39FF14]"
							/>
						</div>

						<div className="flex flex-col gap-2">
							<label
								htmlFor={`unit-${item.id}`}
								className="text-xs uppercase opacity-70 text-[#39FF14]"
							>
								Unit
							</label>
							<select
								name="unit"
								id={`unit-${item.id}`}
								defaultValue={item.unit}
								className="bg-[#051105] border-b border-[#39FF14]/50 p-2 text-[#39FF14] focus:outline-none focus:border-[#39FF14]"
							>
								<option value="unit">unit</option>
								<option value="kg">kg</option>
								<option value="g">g</option>
								<option value="lb">lb</option>
								<option value="oz">oz</option>
								<option value="l">l</option>
								<option value="ml">ml</option>
								<option value="can">can</option>
								<option value="pack">pack</option>
							</select>
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<label
							htmlFor={`tags-${item.id}`}
							className="text-xs uppercase opacity-70 text-[#39FF14]"
						>
							Tags (comma separated)
						</label>
						<input
							type="text"
							name="tags"
							id={`tags-${item.id}`}
							defaultValue={tags.join(", ")}
							className="bg-transparent border-b border-[#39FF14]/50 p-2 text-[#39FF14] focus:outline-none focus:border-[#39FF14]"
							placeholder="e.g. perishable, dairy"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<label
							htmlFor={`expiresAt-${item.id}`}
							className="text-xs uppercase opacity-70 text-[#39FF14]"
						>
							Expiration Date
						</label>
						<input
							type="date"
							name="expiresAt"
							id={`expiresAt-${item.id}`}
							defaultValue={
								item.expiresAt
									? new Date(item.expiresAt).toISOString().split("T")[0]
									: ""
							}
							className="bg-[#051105] border-b border-[#39FF14]/50 p-2 text-[#39FF14] focus:outline-none focus:border-[#39FF14]"
						/>
					</div>

					{fetcher.data?.errors && (
						<div className="text-red-500 text-xs">
							{Object.values(fetcher.data.errors.fieldErrors || {})
								.flat()
								.join(", ")}
						</div>
					)}

					<div className="flex justify-end gap-4 pt-4 border-t border-[#39FF14]/30">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-[#39FF14]/50 hover:text-[#39FF14] uppercase text-xs tracking-wider"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isUpdating}
							className="px-4 py-2 bg-[#39FF14] text-black font-bold uppercase text-xs tracking-wider hover:bg-[#2bff00] disabled:opacity-50 shadow-[0_0_15px_rgba(57,255,20,0.5)]"
						>
							{isUpdating ? "Updating..." : "Update"}
						</button>
					</div>
				</fetcher.Form>
			</div>
		</div>
	);
}
