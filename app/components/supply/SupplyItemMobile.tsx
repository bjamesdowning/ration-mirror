import { MoreHorizontal } from "lucide-react";
import { SupplyItemCheckbox } from "./SupplyItemCheckbox";
import { SupplyItemSourceLine } from "./SupplyItemSourceLine";
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
	sourceMealName: string | null | undefined;
	sourceMealNames?: string[] | null;
	sourceMealSources?: { id: string; name: string }[];
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
	sourceMealName,
	sourceMealNames,
	sourceMealSources,
}: SupplyItemMobileProps) {
	const nameClasses = `text-carbon dark:text-white ${
		optimisticPurchased ? "line-through text-muted" : ""
	}`;

	return (
		<div className="flex items-start gap-2">
			<SupplyItemCheckbox
				optimisticPurchased={optimisticPurchased}
				isPending={isPending}
				onClick={onToggle}
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-start justify-between gap-2">
					<span
						className={`flex-1 text-base font-semibold line-clamp-2 ${nameClasses}`}
						title={displayName}
					>
						{displayName}
					</span>
					<button
						type="button"
						onClick={onOpenActions}
						className="flex-shrink-0 p-2 -mr-1 text-muted hover:text-carbon transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
						aria-label="Item actions"
					>
						<MoreHorizontal className="w-4 h-4" aria-hidden="true" />
					</button>
				</div>
				<div className="mt-1 pl-0">
					<SupplyQuantityEditor
						quantity={localQuantity}
						unit={localUnit}
						onChange={onQuantityChange}
						disabled={optimisticPurchased || isPending}
						variant="pill"
					/>
				</div>
				<SupplyItemSourceLine
					sourceMealName={sourceMealName}
					sourceMealNames={sourceMealNames}
					sourceMealSources={sourceMealSources}
				/>
			</div>
		</div>
	);
}
