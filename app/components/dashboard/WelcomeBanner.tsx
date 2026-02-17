import { Link } from "react-router";

type WelcomeBannerProps = {
	promoCode: string;
};

export function WelcomeBanner({ promoCode }: WelcomeBannerProps) {
	return (
		<div className="glass-panel rounded-xl p-4 border border-hyper-green/30">
			<p className="text-sm text-carbon">
				Welcome to Ration. Claim your free credits with code{" "}
				<span className="font-bold text-hyper-green">{promoCode}</span>.
			</p>
			<div className="mt-3 flex gap-3">
				<Link
					to="/dashboard/pricing"
					className="px-3 py-2 text-sm font-semibold rounded-lg bg-hyper-green text-carbon"
				>
					Claim Credits
				</Link>
				<button
					type="button"
					onClick={() => navigator.clipboard.writeText(promoCode)}
					className="px-3 py-2 text-sm font-medium rounded-lg bg-platinum text-carbon"
				>
					Copy Code
				</button>
			</div>
		</div>
	);
}
