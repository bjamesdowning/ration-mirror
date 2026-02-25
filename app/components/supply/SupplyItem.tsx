import { useFetcher } from "react-router";
import type { supplyItem } from "~/db/schema";
import { useConfirm } from "~/lib/confirm-context";
import { formatQuantity } from "~/lib/format-quantity";
import type { SupplyItemWithSource } from "~/lib/supply.server";
import { SupplyItemSourceLine } from "./SupplyItemSourceLine";

interface SupplyItemProps {
	item:
		| SupplyItemWithSource
		| (typeof supplyItem.$inferSelect & {
				sourceMealName?: string | null;
				sourceMealNames?: string[] | null;
		  });
	listId: string;
	onDelete?: () => void;
}

export function SupplyItem({ item, listId, onDelete }: SupplyItemProps) {
	const { confirm } = useConfirm();
	const fetcher = useFetcher();

	const isPending = fetcher.state !== "idle";
	const optimisticPurchased =
		fetcher.formData?.get("isPurchased") !== undefined
			? fetcher.formData.get("isPurchased") === "true"
			: item.isPurchased;

	const handleToggle = () => {
		fetcher.submit(
			{ isPurchased: String(!item.isPurchased) },
			{
				method: "PUT",
				action: `/api/supply-lists/${listId}/items/${item.id}`,
				encType: "application/json",
			},
		);
	};

	const handleDelete = async () => {
		if (
			!(await confirm({
				title: "Remove this item from the list?",
				message: "This will delete the item from your supply list.",
				confirmLabel: "Remove",
				variant: "danger",
			}))
		)
			return;

		fetcher.submit(null, {
			method: "DELETE",
			action: `/api/supply-lists/${listId}/items/${item.id}`,
		});
		onDelete?.();
	};

	return (
		<div
			className={`group py-3 px-4 border-b border-platinum last:border-0 transition-all ${
				isPending ? "opacity-60" : ""
			} ${optimisticPurchased ? "opacity-50" : ""}`}
		>
			{/* Row 1: Checkbox | Item Name | Quantity | Delete */}
			<div className="flex items-center gap-3">
				{/* Checkbox */}
				<button
					type="button"
					onClick={handleToggle}
					className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-md border-2 transition-all ${
						optimisticPurchased
							? "border-hyper-green bg-hyper-green text-carbon"
							: "border-platinum hover:border-hyper-green"
					}`}
					aria-label={
						optimisticPurchased ? "Mark as not purchased" : "Mark as purchased"
					}
				>
					{optimisticPurchased && (
						<svg
							aria-hidden="true"
							className="w-3 h-3"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={3}
								d="M5 13l4 4L19 7"
							/>
						</svg>
					)}
				</button>

				{/* Item Name */}
				<span
					className={`flex-1 text-carbon min-w-0 ${
						optimisticPurchased ? "line-through text-muted" : ""
					}`}
				>
					{item.name}
				</span>

				{/* Quantity */}
				<span className="text-sm text-muted text-data flex-shrink-0">
					{formatQuantity(item.quantity, item.unit)}
				</span>

				{/* Delete Button */}
				<button
					type="button"
					onClick={handleDelete}
					className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all p-1 flex-shrink-0"
					aria-label="Remove item"
				>
					<svg
						aria-hidden="true"
						className="w-4 h-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						/>
					</svg>
				</button>
			</div>

			{/* Row 2: Source line (From: Meal Name / Added manually) */}
			<SupplyItemSourceLine
				sourceMealName={item.sourceMealName}
				sourceMealNames={item.sourceMealNames}
			/>
		</div>
	);
}
