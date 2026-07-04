import type { supplyItem } from "~/db/schema";
import type { SupplyItemWithSource } from "~/lib/supply.server";
import { resolveSupplyItemTags } from "~/lib/supply-tags";
import { PurchaseQuantityModal } from "./PurchaseQuantityModal";
import { SupplyItemActionsSheet } from "./SupplyItemActionsSheet";
import { SupplyItemDesktop } from "./SupplyItemDesktop";
import { SupplyItemMobile } from "./SupplyItemMobile";
import { useSupplyItemState } from "./useSupplyItemState";

interface SupplyItemProps {
	item:
		| SupplyItemWithSource
		| (typeof supplyItem.$inferSelect & {
				sourceMealName?: string | null;
				sourceMealNames?: string[] | null;
				sourceMealSources?: { id: string; name: string }[];
		  });
	listId: string;
	cargoRows?: Array<{ name: string; tags: unknown }>;
	onDelete?: () => void;
	onSnooze?: () => void;
	onRefresh?: () => void;
}

export function SupplyItem({
	item,
	listId,
	cargoRows = [],
	onDelete,
	onSnooze,
	onRefresh,
}: SupplyItemProps) {
	const state = useSupplyItemState({
		item,
		listId,
		onDelete,
		onSnooze,
		onRefresh,
	});

	const displayTags = resolveSupplyItemTags({
		itemName: item.name,
		cargoRows,
		sourceMealIds: item.sourceMealIds ?? [],
	});

	const rowClasses = `group py-2 px-1 md:py-3 md:px-4 border-b border-platinum dark:border-white/10 last:border-0 transition-all ${
		state.isPending ? "opacity-60" : ""
	} ${state.optimisticPurchased ? "opacity-50" : ""}`;

	return (
		<>
			<div data-testid="supply-item-row" className={rowClasses}>
				<div className="md:hidden">
					<SupplyItemMobile
						displayName={state.displayName}
						optimisticPurchased={state.optimisticPurchased}
						isPending={state.isPending}
						localQuantity={state.localQuantity}
						localUnit={state.localUnit}
						onToggle={state.handleToggle}
						onQuantityChange={state.handleQuantityChange}
						onOpenActions={() => state.setShowActionsSheet(true)}
					/>
				</div>
				<div className="hidden md:block">
					<SupplyItemDesktop
						displayName={state.displayName}
						displayTags={displayTags}
						mealSourced={state.mealSourced}
						convertLabel={state.convertLabel}
						optimisticPurchased={state.optimisticPurchased}
						isPending={state.isPending}
						localQuantity={state.localQuantity}
						localUnit={state.localUnit}
						onToggle={state.handleToggle}
						onQuantityChange={state.handleQuantityChange}
						onConvert={state.handleConvertUnit}
						onSnooze={state.handleSnooze}
						onDelete={state.handleDelete}
						sourceMealName={state.sourceMealName}
						sourceMealNames={state.sourceMealNames}
						sourceMealSources={state.sourceMealSources}
					/>
				</div>
			</div>

			{state.showPurchaseModal && (
				<PurchaseQuantityModal
					itemName={state.displayName}
					quantity={state.localQuantity}
					unit={state.localUnit}
					isPending={state.isPending}
					onConfirm={state.submitPurchased}
					onCancel={() => state.setShowPurchaseModal(false)}
				/>
			)}

			{state.showActionsSheet && (
				<SupplyItemActionsSheet
					itemName={state.displayName}
					isMealSourced={state.mealSourced}
					convertLabel={state.convertLabel}
					isPending={state.isPending}
					isConvertPending={state.isConvertPending}
					sourceMealName={state.sourceMealName}
					sourceMealNames={state.sourceMealNames}
					sourceMealSources={state.sourceMealSources}
					onClose={() => state.setShowActionsSheet(false)}
					onConvert={state.handleConvertUnit}
					onSnooze={state.handleSnooze}
					onRemove={state.handleDelete}
				/>
			)}
		</>
	);
}
