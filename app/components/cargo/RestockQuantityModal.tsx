import { PurchaseQuantityModal } from "~/components/supply/PurchaseQuantityModal";

interface RestockQuantityModalProps {
	itemName: string;
	quantity: number;
	unit: string;
	onConfirm: (quantity: number, unit: string) => void;
	onCancel: () => void;
	isPending?: boolean;
}

/**
 * Quantity prompt when adding a Cargo item to the Supply restock list.
 */
export function RestockQuantityModal(props: RestockQuantityModalProps) {
	return (
		<PurchaseQuantityModal
			{...props}
			itemName={props.itemName}
			quantity={props.quantity}
			unit={props.unit}
		/>
	);
}
