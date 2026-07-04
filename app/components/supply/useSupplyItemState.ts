import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { supplyItem } from "~/db/schema";
import { useConfirm } from "~/lib/confirm-context";
import { toTitleCase } from "~/lib/format-display";
import type { SupplyItemWithSource } from "~/lib/supply.server";
import { type SupportedUnit, toSupportedUnit } from "~/lib/units";

export type SupplyItemData =
	| SupplyItemWithSource
	| (typeof supplyItem.$inferSelect & {
			sourceMealName?: string | null;
			sourceMealNames?: string[] | null;
			sourceMealSources?: { id: string; name: string }[];
	  });

export interface UseSupplyItemStateOptions {
	item: SupplyItemData;
	listId: string;
	onDelete?: () => void;
	onSnooze?: () => void;
	onRefresh?: () => void;
}

export function isMealSourced(item: SupplyItemData): boolean {
	const sourceIds =
		Array.isArray(item.sourceMealIds) && item.sourceMealIds.length > 0
			? item.sourceMealIds
			: item.sourceMealId
				? [item.sourceMealId]
				: [];
	return sourceIds.length > 0;
}

export function useSupplyItemState({
	item,
	listId,
	onDelete,
	onSnooze,
	onRefresh,
}: UseSupplyItemStateOptions) {
	const { confirm } = useConfirm();
	const fetcher = useFetcher<{
		snoozed?: boolean;
		deleted?: boolean;
		item?: { id: string };
	}>();
	const [showActionsSheet, setShowActionsSheet] = useState(false);
	const [showPurchaseModal, setShowPurchaseModal] = useState(false);
	const [isMarkingPurchased, setIsMarkingPurchased] = useState(false);
	const [pendingAction, setPendingAction] = useState<
		"snooze" | "delete" | "convert" | null
	>(null);
	const [localQuantity, setLocalQuantity] = useState(item.quantity);
	const [localUnit, setLocalUnit] = useState<SupportedUnit>(
		toSupportedUnit(item.unit ?? "unit"),
	);

	const isPending = fetcher.state !== "idle";
	const optimisticPurchased =
		isMarkingPurchased ||
		(fetcher.formData?.get("isPurchased") !== undefined
			? fetcher.formData.get("isPurchased") === "true"
			: item.isPurchased);
	const mealSourced = isMealSourced(item);
	const displayName = toTitleCase(item.name);

	const currentUnitNorm = localUnit.trim().toLowerCase();
	const isWeightUnit =
		currentUnitNorm === "g" ||
		currentUnitNorm === "kg" ||
		currentUnitNorm === "oz" ||
		currentUnitNorm === "lb";
	const convertLabel = isWeightUnit
		? "Convert to cooking units"
		: "Convert to shopping units";

	useEffect(() => {
		if (fetcher.state === "idle" && !isMarkingPurchased) {
			setLocalQuantity(item.quantity);
			setLocalUnit(toSupportedUnit(item.unit ?? "unit"));
		}
	}, [item.quantity, item.unit, fetcher.state, isMarkingPurchased]);

	useEffect(() => {
		if (fetcher.state === "idle") {
			setIsMarkingPurchased(false);
			setPendingAction(null);
		}
	}, [fetcher.state]);

	useEffect(() => {
		if (fetcher.state !== "idle" || !pendingAction) return;

		if (pendingAction === "snooze" && fetcher.data?.snoozed) {
			onSnooze?.();
		}
		if (pendingAction === "delete" && fetcher.data?.deleted) {
			onDelete?.();
		}
		if (pendingAction === "convert" && fetcher.data?.item) {
			onRefresh?.();
		}
	}, [
		fetcher.state,
		fetcher.data,
		pendingAction,
		onDelete,
		onSnooze,
		onRefresh,
	]);

	const submitPurchased = (quantity: number, unit: string) => {
		setShowPurchaseModal(false);
		setIsMarkingPurchased(true);
		setLocalQuantity(quantity);
		setLocalUnit(toSupportedUnit(unit));
		fetcher.submit(
			JSON.stringify({
				isPurchased: true,
				quantity,
				unit: unit.trim() || "unit",
			}),
			{
				method: "PUT",
				action: `/api/supply-lists/${listId}/items/${item.id}`,
				encType: "application/json",
			},
		);
	};

	const handleToggle = () => {
		if (optimisticPurchased) {
			fetcher.submit(
				{ isPurchased: "false" },
				{
					method: "PUT",
					action: `/api/supply-lists/${listId}/items/${item.id}`,
					encType: "application/json",
				},
			);
			setLocalQuantity(item.quantity);
			setLocalUnit(toSupportedUnit(item.unit ?? "unit"));
			return;
		}

		setShowPurchaseModal(true);
	};

	const handleSnooze = (duration: "24h" | "3d" | "1w") => {
		setPendingAction("snooze");
		fetcher.submit(
			{ duration },
			{
				method: "POST",
				action: `/api/supply-lists/${listId}/items/${item.id}`,
				encType: "application/json",
			},
		);
	};

	const handleConvertUnit = () => {
		setPendingAction("convert");
		fetcher.submit(
			JSON.stringify({
				intent: "convert-unit",
				mode: isWeightUnit ? "cooking" : "shopping",
				preferredSystem: "metric",
			}),
			{
				method: "POST",
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

		setPendingAction("delete");
		fetcher.submit(null, {
			method: "DELETE",
			action: `/api/supply-lists/${listId}/items/${item.id}`,
		});
	};

	const handleQuantityChange = (qty: number, unit: string) => {
		setLocalQuantity(qty);
		setLocalUnit(toSupportedUnit(unit));
	};

	const sourceMealSources =
		"sourceMealSources" in item ? item.sourceMealSources : undefined;

	return {
		displayName,
		mealSourced,
		convertLabel,
		isPending,
		isConvertPending: pendingAction === "convert" && isPending,
		optimisticPurchased,
		localQuantity,
		localUnit,
		handleToggle,
		handleSnooze,
		handleConvertUnit,
		handleDelete,
		handleQuantityChange,
		showActionsSheet,
		setShowActionsSheet,
		showPurchaseModal,
		setShowPurchaseModal,
		submitPurchased,
		sourceMealName: item.sourceMealName,
		sourceMealNames: item.sourceMealNames,
		sourceMealSources,
	};
}
