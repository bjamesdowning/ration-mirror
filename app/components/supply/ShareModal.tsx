import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

interface ShareModalProps {
	listId: string;
	existingShareToken?: string | null;
	onClose: () => void;
}

export function ShareModal({
	listId,
	existingShareToken,
	onClose,
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
		if (fetcher.data?.shareUrl) {
			setShareUrl(fetcher.data.shareUrl);
		}
		if (fetcher.data?.revoked) {
			setShareUrl(null);
		}
	}, [fetcher.data]);

	const handleGenerateLink = () => {
		fetcher.submit(null, {
			method: "POST",
			action: `/api/grocery-lists/${listId}/share`,
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
			action: `/api/grocery-lists/${listId}/share`,
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
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
			<div className="bg-[#051105] border border-[#39FF14] max-w-lg w-full p-6 relative">
				{/* Close Button */}
				<button
					type="button"
					onClick={onClose}
					className="absolute top-4 right-4 text-[#39FF14]/70 hover:text-[#39FF14] transition-colors"
					aria-label="Close"
				>
					<svg
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
				<h2 className="text-xl font-bold uppercase tracking-wider mb-2">
					Share List
				</h2>
				<p className="text-sm opacity-70 mb-6">
					Generate a shareable link for this grocery list. Anyone with the link
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
								className="flex-1 bg-black border border-[#39FF14]/50 p-3 font-mono text-xs text-[#39FF14] focus:outline-none"
							/>
							<button
								type="button"
								onClick={handleCopy}
								className={`px-4 font-bold uppercase tracking-wider transition-all ${
									copied
										? "bg-[#39FF14] text-black"
										: "border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14]/10"
								}`}
							>
								{copied ? "Copied!" : "Copy"}
							</button>
						</div>

						{/* Expiry Notice */}
						<p className="text-xs opacity-50">
							⚠ This link expires in 7 days for security.
						</p>

						{/* Revoke Button */}
						<button
							type="button"
							onClick={handleRevokeLink}
							disabled={isPending}
							className="w-full py-2 border border-red-500/50 text-red-500 hover:bg-red-500/10 font-mono uppercase text-sm transition-colors disabled:opacity-50"
						>
							{isPending ? "Processing..." : "Revoke Share Link"}
						</button>
					</div>
				) : (
					<div className="text-center py-8">
						<div className="text-4xl mb-4">🔗</div>
						<p className="text-sm opacity-70 mb-6">
							No share link generated yet. Create one to share this list with
							others.
						</p>
						<button
							type="button"
							onClick={handleGenerateLink}
							disabled={isPending}
							className="px-8 py-3 bg-[#39FF14] text-black font-bold uppercase tracking-wider hover:bg-[#2bff00] disabled:opacity-50 transition-all"
						>
							{isPending ? "Generating..." : "Generate Share Link"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
