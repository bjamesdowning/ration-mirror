import { useEffect, useRef, useState } from "react";
import {
	SUPPORTED_UNITS,
	type SupportedUnit,
	toSupportedUnit,
} from "~/lib/units";

interface PurchaseQuantityModalProps {
	itemName: string;
	quantity: number;
	unit: string;
	onConfirm: (quantity: number, unit: string) => void;
	onCancel: () => void;
	isPending?: boolean;
}

export function PurchaseQuantityModal({
	itemName,
	quantity,
	unit,
	onConfirm,
	onCancel,
	isPending = false,
}: PurchaseQuantityModalProps) {
	const normalizedUnit = toSupportedUnit(unit);
	const [localQuantity, setLocalQuantity] = useState(quantity);
	const [localUnit, setLocalUnit] = useState<SupportedUnit>(normalizedUnit);
	const quantityInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setLocalQuantity(quantity);
		setLocalUnit(toSupportedUnit(unit));
	}, [quantity, unit]);

	useEffect(() => {
		quantityInputRef.current?.focus();
	}, []);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onCancel();
			if (e.key === "Enter") {
				e.preventDefault();
				const qty = Number(localQuantity);
				if (Number.isFinite(qty) && qty >= 0) {
					onConfirm(qty, localUnit);
				}
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [localQuantity, localUnit, onCancel, onConfirm]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const qty = Number(localQuantity);
		if (!Number.isFinite(qty) || qty < 0) return;
		onConfirm(qty, localUnit);
	}

	function handleUseAsListed() {
		onConfirm(quantity, normalizedUnit);
	}

	return (
		<div className="fixed inset-0 bg-carbon/30 backdrop-blur-sm flex items-center justify-center z-[80]">
			<div className="bg-ceramic rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-bold text-carbon">What did you buy?</h2>
					<button
						type="button"
						onClick={onCancel}
						className="text-muted hover:text-carbon text-2xl transition-colors"
						aria-label="Cancel"
					>
						×
					</button>
				</div>

				<p className="text-carbon font-medium mb-4">{itemName}</p>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="flex flex-col gap-2">
							<label
								htmlFor="purchase-quantity"
								className="text-label text-muted"
							>
								Quantity
							</label>
							<input
								ref={quantityInputRef}
								id="purchase-quantity"
								type="number"
								value={localQuantity}
								onChange={(e) => setLocalQuantity(Number(e.target.value))}
								min={0}
								step="any"
								disabled={isPending}
								className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="purchase-unit" className="text-label text-muted">
								Unit
							</label>
							<select
								id="purchase-unit"
								value={localUnit}
								onChange={(e) => setLocalUnit(e.target.value as SupportedUnit)}
								disabled={isPending}
								className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none appearance-none cursor-pointer"
							>
								{SUPPORTED_UNITS.map((u) => (
									<option key={u} value={u}>
										{u}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className="flex flex-col gap-2 pt-4 border-t border-platinum">
						<button
							type="submit"
							disabled={isPending}
							className="w-full bg-hyper-green text-carbon font-bold px-6 py-3 rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50"
						>
							{isPending ? "Saving..." : "Confirm Purchase"}
						</button>
						<button
							type="button"
							onClick={handleUseAsListed}
							disabled={isPending}
							className="w-full bg-platinum text-carbon font-semibold px-6 py-2 rounded-lg hover:bg-platinum/80 transition-colors disabled:opacity-50"
						>
							Use as listed ({quantity} {normalizedUnit})
						</button>
						<button
							type="button"
							onClick={onCancel}
							className="w-full text-muted hover:text-carbon font-medium py-2 transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
