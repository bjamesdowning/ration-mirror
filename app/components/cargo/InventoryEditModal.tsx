// @ts-nocheck
import type { useFetcher } from "react-router";
import type { inventory } from "~/db/schema";
import { formatInventoryCategory, INVENTORY_CATEGORIES } from "~/lib/inventory";

interface InventoryEditModalProps {
	item: typeof inventory.$inferSelect;
	tags: string[];
	onClose: () => void;
	fetcher: ReturnType<typeof useFetcher<unknown>>;
	isUpdating: boolean;
}

export function InventoryEditModal({
	item,
	tags,
	onClose,
	fetcher,
	isUpdating,
}: InventoryEditModalProps) {
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
							htmlFor={`category-${item.id}`}
							className="text-xs uppercase opacity-70 text-[#39FF14]"
						>
							Category
						</label>
						<select
							name="category"
							id={`category-${item.id}`}
							defaultValue={item.category ?? "other"}
							className="bg-[#051105] border-b border-[#39FF14]/50 p-2 text-[#39FF14] focus:outline-none focus:border-[#39FF14]"
						>
							{INVENTORY_CATEGORIES.map((category) => (
								<option key={category} value={category}>
									{formatInventoryCategory(category)}
								</option>
							))}
						</select>
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
