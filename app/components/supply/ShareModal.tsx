import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { LinkIcon } from "~/components/icons/PageIcons";

interface ShareModalProps {
	listId: string;
	existingShareToken?: string | null;
	onClose: () => void;
	/** Called when the share API returns a feature_gated 403 — parent should show UpgradePrompt */
	onUpgradeRequired?: () => void;
}

export function ShareModal({
	listId,
	existingShareToken,
	onClose,
	onUpgradeRequired,
}: ShareModalProps) {
	const fetcher = useFetcher();
	const [copied, setCopied] = useState(false);
	const [shareUrl, setShareUrl] = useState<string | null>(null);

	const isPending = fetcher.state !== "idle";

	// If there's an existing share token, construct the URL
	useEffect(() => {
		if (existingShareToken) {
			setShareUrl(`${window.location.origin}/shared/${existingShareToken}`);
		}
	}, [existingShareToken]);

	// Handle response from fetcher
	useEffect(() => {
		if (!fetcher.data) return;
		if (fetcher.data.error === "feature_gated") {
			onClose();
			onUpgradeRequired?.();
			return;
		}
		if (fetcher.data.shareUrl) {
			setShareUrl(fetcher.data.shareUrl);
		}
		if (fetcher.data.revoked) {
			setShareUrl(null);
		}
	}, [fetcher.data, onClose, onUpgradeRequired]);

	const handleGenerateLink = () => {
		fetcher.submit(null, {
			method: "POST",
			action: `/api/supply-lists/${listId}/share`,
		});
	};

	const handleRevokeLink = () => {
		if (
			!window.confirm(
				"Revoke this share link? Anyone with the link will no longer be able to view the list.",
			)
		) {
			return;
		}
		fetcher.submit(null, {
			method: "DELETE",
			action: `/api/supply-lists/${listId}/share`,
		});
	};

	const handleCopy = async () => {
		if (!shareUrl) return;

		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback for older browsers
			const textArea = document.createElement("textarea");
			textArea.value = shareUrl;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<div className="fixed inset-0 bg-carbon/30 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
			<div className="bg-ceramic rounded-2xl shadow-xl p-6 max-w-md mx-auto w-full relative">
				{/* Close Button */}
				<button
					type="button"
					onClick={onClose}
					className="absolute top-4 right-4 text-muted hover:text-carbon transition-colors"
					aria-label="Close"
				>
					<svg
						aria-hidden="true"
						className="w-6 h-6"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>

				{/* Header */}
				<h2 className="text-xl font-bold text-carbon mb-2">Share List</h2>
				<p className="text-sm text-muted mb-6">
					Generate a shareable link for this supply list. Anyone with the link
					can view (but not edit) your list.
				</p>

				{/* Content */}
				{shareUrl ? (
					<div className="space-y-4">
						{/* URL Display */}
						<div className="flex gap-2">
							<input
								type="text"
								value={shareUrl}
								readOnly
								className="flex-1 bg-platinum rounded-lg px-4 py-3 text-carbon font-mono text-sm focus:outline-none"
							/>
							<button
								type="button"
								onClick={handleCopy}
								className={`px-4 py-2 rounded-lg font-semibold transition-all ${
									copied
										? "bg-hyper-green text-carbon shadow-glow-sm"
										: "bg-platinum text-carbon hover:bg-platinum/80"
								}`}
							>
								{copied ? "Copied!" : "Copy"}
							</button>
						</div>

						{/* Expiry Notice */}
						<p className="text-xs text-muted">
							⚠ This link expires in 7 days for security.
						</p>

						{/* Revoke Button */}
						<button
							type="button"
							onClick={handleRevokeLink}
							disabled={isPending}
							className="w-full py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
						>
							{isPending ? "Processing..." : "Revoke Share Link"}
						</button>
					</div>
				) : (
					<div className="text-center py-8">
						<LinkIcon className="w-12 h-12 text-muted mx-auto mb-4 block" />
						<p className="text-sm text-muted mb-6">
							No share link generated yet. Create one to share this list with
							others.
						</p>
						<button
							type="button"
							onClick={handleGenerateLink}
							disabled={isPending}
							className="px-6 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all"
						>
							{isPending ? "Generating..." : "Generate Share Link"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
