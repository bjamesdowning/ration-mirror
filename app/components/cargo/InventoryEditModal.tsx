// @ts-nocheck
import type { useFetcher } from "react-router";
import type { inventory } from "~/db/schema";
import { DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";

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
		<div className="fixed inset-0 bg-carbon/30 backdrop-blur-sm flex items-center justify-center z-[80]">
			<div className="bg-ceramic rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
				<div className="flex justify-between items-center mb-6">
					<h2 className="text-xl font-bold text-carbon">Edit Item</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-muted hover:text-carbon text-2xl transition-colors"
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
							className="text-label text-muted"
						>
							Name
						</label>
						<input
							type="text"
							name="name"
							id={`name-${item.id}`}
							defaultValue={item.name}
							required
							className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="flex flex-col gap-2">
							<label
								htmlFor={`quantity-${item.id}`}
								className="text-label text-muted"
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
								className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>

						<div className="flex flex-col gap-2">
							<label
								htmlFor={`unit-${item.id}`}
								className="text-label text-muted"
							>
								Unit
							</label>
							<select
								name="unit"
								id={`unit-${item.id}`}
								defaultValue={item.unit}
								className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none appearance-none"
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
							htmlFor={`domain-${item.id}`}
							className="text-label text-muted"
						>
							Domain
						</label>
						<select
							name="domain"
							id={`domain-${item.id}`}
							defaultValue={item.domain ?? "food"}
							className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none appearance-none"
						>
							{ITEM_DOMAINS.map((domain) => (
								<option key={domain} value={domain}>
									{DOMAIN_LABELS[domain]}
								</option>
							))}
						</select>
					</div>

					<div className="flex flex-col gap-2">
						<label
							htmlFor={`tags-${item.id}`}
							className="text-label text-muted"
						>
							Tags (comma separated)
						</label>
						<input
							type="text"
							name="tags"
							id={`tags-${item.id}`}
							defaultValue={tags.join(", ")}
							className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							placeholder="e.g. perishable, dairy"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<label
							htmlFor={`expiresAt-${item.id}`}
							className="text-label text-muted"
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
							className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>

					{fetcher.data?.errors && (
						<div className="text-danger text-sm">
							{Object.values(fetcher.data.errors.fieldErrors || {})
								.flat()
								.join(", ")}
						</div>
					)}

					<div className="flex justify-end gap-3 pt-4 border-t border-platinum">
						<button
							type="button"
							onClick={onClose}
							className="bg-platinum text-carbon px-4 py-2 rounded-lg hover:bg-platinum/80 transition-colors"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isUpdating}
							className="bg-hyper-green text-carbon font-bold px-6 py-3 rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50"
						>
							{isUpdating ? "Saving..." : "Save Changes"}
						</button>
					</div>
				</fetcher.Form>
			</div>
		</div>
	);
}
