import { MoreHorizontal } from "lucide-react";
import { SupplyItemCheckbox } from "./SupplyItemCheckbox";
import { SupplyQuantityEditor } from "./SupplyQuantityEditor";

interface SupplyItemMobileProps {
	displayName: string;
	optimisticPurchased: boolean;
	isPending: boolean;
	localQuantity: number;
	localUnit: string;
	onToggle: () => void;
	onQuantityChange: (quantity: number, unit: string) => void;
	onOpenActions: () => void;
}

export function SupplyItemMobile({
	displayName,
	optimisticPurchased,
	isPending,
	localQuantity,
	localUnit,
	onToggle,
	onQuantityChange,
	onOpenActions,
}: SupplyItemMobileProps) {
	const nameClasses = `truncate ${
		optimisticPurchased
			? "line-through text-muted"
			: "text-carbon dark:text-white"
	}`;

	return (
		<div className="flex items-center gap-2 min-h-[40px]">
			<SupplyItemCheckbox
				optimisticPurchased={optimisticPurchased}
				isPending={isPending}
				onClick={onToggle}
			/>
			<span
				className={`flex-1 min-w-0 text-sm font-medium ${nameClasses}`}
				title={displayName}
			>
				{displayName}
			</span>
			<SupplyQuantityEditor
				quantity={localQuantity}
				unit={localUnit}
				ingredientName={displayName}
				onChange={onQuantityChange}
				disabled={optimisticPurchased || isPending}
				variant="inline"
				className="shrink-0"
			/>
			<button
				type="button"
				onClick={onOpenActions}
				className="shrink-0 p-1.5 -mr-1 text-muted hover:text-carbon dark:hover:text-white transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
				aria-label="Item actions"
			>
				<MoreHorizontal className="w-4 h-4" aria-hidden="true" />
			</button>
		</div>
	);
}
