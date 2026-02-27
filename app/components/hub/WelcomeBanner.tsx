import { Link } from "react-router";
import { CloseIcon } from "~/components/icons/PageIcons";

type WelcomeBannerProps = {
	promoCode: string;
	onDismiss: () => void;
};

export function WelcomeBanner({ promoCode, onDismiss }: WelcomeBannerProps) {
	return (
		<div className="glass-panel rounded-xl p-4 border border-hyper-green/30 relative">
			<button
				type="button"
				onClick={onDismiss}
				className="absolute top-3 right-3 p-1.5 rounded-full text-muted hover:text-carbon dark:hover:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors"
				aria-label="Dismiss welcome banner"
			>
				<CloseIcon className="w-3.5 h-3.5" />
			</button>

			<p className="text-sm text-carbon dark:text-white pr-8">
				Welcome to Ration. Claim your free credits with code{" "}
				<span className="font-bold text-hyper-green">{promoCode}</span>.
			</p>
			<div className="mt-3 flex gap-3">
				<Link
					to="/hub/pricing"
					className="px-3 py-2 text-sm font-semibold rounded-lg bg-hyper-green text-carbon"
				>
					Claim Credits
				</Link>
				<button
					type="button"
					onClick={() => navigator.clipboard.writeText(promoCode)}
					className="px-3 py-2 text-sm font-medium rounded-lg bg-platinum dark:bg-white/10 text-carbon dark:text-white"
				>
					Copy Code
				</button>
			</div>
		</div>
	);
}
