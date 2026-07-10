import { Camera, Check, X } from "lucide-react";

interface ReplenishModalProps {
	open: boolean;
	purchasedCount: number;
	onClose: () => void;
	onDockPurchased: () => void;
	onScanReceipt: () => void;
	isDocking: boolean;
	scanCost?: number;
}

export function ReplenishModal({
	open,
	purchasedCount,
	onClose,
	onDockPurchased,
	onScanReceipt,
	isDocking,
	scanCost,
}: ReplenishModalProps) {
	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-carbon/40 backdrop-blur-sm p-0 md:p-4">
			<div className="bg-ceramic dark:bg-carbon w-full md:max-w-md md:rounded-2xl shadow-xl">
				<div className="flex items-center justify-between px-4 py-3 border-b border-platinum dark:border-white/10">
					<h2 className="text-lg font-bold">Replenish Cargo</h2>
					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-lg hover:bg-platinum/60"
						aria-label="Close"
					>
						<X className="w-5 h-5" />
					</button>
				</div>
				<div className="p-4 space-y-3">
					<p className="text-sm text-muted">
						After shopping, dock items from your list or scan a receipt to
						reconcile and add to Cargo.
					</p>
					<button
						type="button"
						onClick={onScanReceipt}
						className="w-full flex items-center gap-3 p-4 rounded-xl border border-platinum dark:border-white/10 hover:border-hyper-green/40 hover:bg-hyper-green/5 transition-colors text-left"
					>
						<span className="flex h-10 w-10 items-center justify-center rounded-lg bg-hyper-green/15 text-hyper-green">
							<Camera className="w-5 h-5" />
						</span>
						<span>
							<span className="block font-semibold">Dock from Receipt</span>
							<span className="text-xs text-muted">
								Scan or upload — match to your supply list
								{typeof scanCost === "number"
									? ` · ${scanCost} credit${scanCost === 1 ? "" : "s"}`
									: ""}
							</span>
						</span>
					</button>
					<button
						type="button"
						onClick={() => {
							onClose();
							onDockPurchased();
						}}
						disabled={purchasedCount === 0 || isDocking}
						className="w-full flex items-center gap-3 p-4 rounded-xl border border-platinum dark:border-white/10 hover:border-hyper-green/40 hover:bg-hyper-green/5 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<span className="flex h-10 w-10 items-center justify-center rounded-lg bg-platinum/60 text-carbon">
							<Check className="w-5 h-5" />
						</span>
						<span>
							<span className="block font-semibold">Dock from List</span>
							<span className="text-xs text-muted">
								{purchasedCount > 0
									? `Dock ${purchasedCount} checked-off item${purchasedCount === 1 ? "" : "s"}`
									: "Check off items while shopping first"}
							</span>
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}
