import { Link } from "react-router";
import { CloseIcon } from "~/components/icons/PageIcons";
import { WELCOME_CREDITS } from "~/lib/billing.constants";

type WelcomeBannerProps = {
	onDismiss: () => void;
};

export function WelcomeBanner({ onDismiss }: WelcomeBannerProps) {
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
				Welcome to Ration. Your kitchen includes{" "}
				<span className="font-bold text-hyper-green">
					{WELCOME_CREDITS} free credits
				</span>{" "}
				for AI scans and generations.
			</p>
			<div className="mt-3 flex gap-3">
				<Link
					to="/hub/cargo"
					className="px-3 py-2 text-sm font-semibold rounded-lg bg-hyper-green text-carbon"
				>
					Open Cargo
				</Link>
				<Link
					to="/hub/pricing"
					className="px-3 py-2 text-sm font-medium rounded-lg bg-platinum dark:bg-white/10 text-carbon dark:text-white"
				>
					View pricing
				</Link>
			</div>
		</div>
	);
}
