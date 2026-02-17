import { Link } from "react-router";

type UpgradePromptProps = {
	open: boolean;
	onClose: () => void;
	title?: string;
	description?: string;
};

export function UpgradePrompt({
	open,
	onClose,
	title = "Capacity limit reached",
	description = "Upgrade to Crew Member to unlock unlimited capacity and member invites.",
}: UpgradePromptProps) {
	if (!open) return null;

	return (
		<div className="fixed inset-0 z-[90] bg-carbon/30 backdrop-blur-sm flex items-center justify-center p-4">
			<div className="bg-ceramic rounded-2xl shadow-xl p-6 max-w-md w-full">
				<h3 className="text-lg font-bold text-carbon">{title}</h3>
				<p className="text-sm text-muted mt-2">{description}</p>
				<div className="mt-5 flex gap-3">
					<Link
						to="/dashboard/pricing"
						className="px-4 py-2 rounded-lg bg-hyper-green text-carbon font-bold"
					>
						View Pricing
					</Link>
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 rounded-lg bg-platinum text-carbon font-medium"
					>
						Not now
					</button>
				</div>
			</div>
		</div>
	);
}
