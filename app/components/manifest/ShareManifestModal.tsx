import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { LinkIcon, WarningIcon } from "~/components/icons/PageIcons";
import { useConfirm } from "~/lib/confirm-context";

interface ShareManifestModalProps {
	planId: string;
	existingShareToken?: string | null;
	onClose: () => void;
	onUpgradeRequired?: () => void;
}

export function ShareManifestModal({
	planId,
	existingShareToken,
	onClose,
	onUpgradeRequired,
}: ShareManifestModalProps) {
	const { confirm } = useConfirm();
	const fetcher = useFetcher();
	const [copied, setCopied] = useState(false);
	const [shareUrl, setShareUrl] = useState<string | null>(null);

	const isPending = fetcher.state !== "idle";

	useEffect(() => {
		if (existingShareToken) {
			setShareUrl(
				`${window.location.origin}/shared/manifest/${existingShareToken}`,
			);
		}
	}, [existingShareToken]);

	useEffect(() => {
		if (!fetcher.data) return;
		if (
			fetcher.data &&
			typeof fetcher.data === "object" &&
			"error" in fetcher.data &&
			(fetcher.data as { error: string }).error === "feature_gated"
		) {
			onClose();
			onUpgradeRequired?.();
			return;
		}
		if (
			fetcher.data &&
			typeof fetcher.data === "object" &&
			"shareToken" in fetcher.data
		) {
			const token = (fetcher.data as { shareToken: string }).shareToken;
			setShareUrl(`${window.location.origin}/shared/manifest/${token}`);
		}
		if (
			fetcher.data &&
			typeof fetcher.data === "object" &&
			"revoked" in fetcher.data &&
			(fetcher.data as { revoked: boolean }).revoked
		) {
			setShareUrl(null);
		}
	}, [fetcher.data, onClose, onUpgradeRequired]);

	const handleGenerateLink = () => {
		fetcher.submit(null, {
			method: "POST",
			action: `/api/meal-plans/${planId}/share`,
		});
	};

	const handleRevokeLink = async () => {
		if (
			!(await confirm({
				title: "Revoke this share link?",
				message:
					"Anyone with the link will no longer be able to view the plan.",
				confirmLabel: "Revoke",
				variant: "danger",
			}))
		) {
			return;
		}
		fetcher.submit(null, {
			method: "DELETE",
			action: `/api/meal-plans/${planId}/share`,
		});
	};

	const handleCopy = async () => {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
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
				{/* Close button */}
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
				<h2 className="text-xl font-bold text-carbon mb-2">Share Manifest</h2>
				<p className="text-sm text-muted mb-6">
					Generate a read-only link to share this meal plan with your group.
					Anyone with the link can view (but not edit) the plan.
				</p>

				{shareUrl ? (
					<div className="space-y-4">
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
						<p className="text-xs text-muted flex items-center gap-1">
							<WarningIcon className="w-3.5 h-3.5 shrink-0" />
							This link expires in 7 days for security.
						</p>
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
							No share link yet. Create one to share this manifest with others.
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
