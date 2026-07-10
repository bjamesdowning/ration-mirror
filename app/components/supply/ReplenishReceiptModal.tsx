import { Camera, FileUp, X } from "lucide-react";
import { Link } from "react-router";

interface ReplenishReceiptModalProps {
	open: boolean;
	onClose: () => void;
	onPickCamera: () => void;
	onPickFile: () => void;
	credits: number;
	costPerScan: number;
}

/**
 * Combined AI intro + scan source picker — one screen after "Dock from Receipt".
 */
export function ReplenishReceiptModal({
	open,
	onClose,
	onPickCamera,
	onPickFile,
	credits,
	costPerScan,
}: ReplenishReceiptModalProps) {
	if (!open) return null;

	const hasEnoughCredits = credits >= costPerScan;

	return (
		<div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-carbon/40 backdrop-blur-sm p-0 md:p-4">
			<div className="bg-ceramic dark:bg-carbon w-full md:max-w-md md:rounded-2xl shadow-xl">
				<div className="flex items-center justify-between px-4 py-3 border-b border-platinum dark:border-white/10">
					<h2 className="text-lg font-bold">Dock from Receipt</h2>
					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-lg hover:bg-platinum/60"
						aria-label="Close"
					>
						<X className="w-5 h-5" />
					</button>
				</div>
				<div className="p-4 space-y-4">
					<p className="text-sm text-muted">
						AI reads your receipt, matches lines to your Supply list, then docks
						purchased items to Cargo.
					</p>
					<p className="text-xs text-muted">
						Uses {costPerScan} credit{costPerScan === 1 ? "" : "s"} per scan.
						You have {credits} credit{credits === 1 ? "" : "s"}.
					</p>

					{hasEnoughCredits ? (
						<div className="space-y-3">
							<button
								type="button"
								onClick={() => {
									onClose();
									onPickCamera();
								}}
								className="w-full flex items-center gap-3 p-4 rounded-xl border border-platinum dark:border-white/10 hover:border-hyper-green/40 hover:bg-hyper-green/5 transition-colors text-left"
							>
								<span className="flex h-10 w-10 items-center justify-center rounded-lg bg-hyper-green/15 text-hyper-green">
									<Camera className="w-5 h-5" />
								</span>
								<span>
									<span className="block font-semibold">Camera</span>
									<span className="text-xs text-muted">
										Take a photo of your receipt
									</span>
								</span>
							</button>
							<button
								type="button"
								onClick={() => {
									onClose();
									onPickFile();
								}}
								className="w-full flex items-center gap-3 p-4 rounded-xl border border-platinum dark:border-white/10 hover:border-hyper-green/40 hover:bg-hyper-green/5 transition-colors text-left"
							>
								<span className="flex h-10 w-10 items-center justify-center rounded-lg bg-platinum/60 text-carbon">
									<FileUp className="w-5 h-5" />
								</span>
								<span>
									<span className="block font-semibold">Upload file</span>
									<span className="text-xs text-muted">
										Receipt image or PDF from your device
									</span>
								</span>
							</button>
						</div>
					) : (
						<div className="space-y-3">
							<p className="text-sm text-muted">
								You need at least {costPerScan} credit
								{costPerScan === 1 ? "" : "s"} to scan a receipt.
							</p>
							<Link
								to="/hub/pricing"
								onClick={onClose}
								className="block w-full text-center px-6 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
							>
								Get credits
							</Link>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
