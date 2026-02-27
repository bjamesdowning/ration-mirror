import { Link } from "react-router";
import { fireConfetti } from "../confetti";

interface Step5Props {
	onComplete: () => void;
	onSkip: () => void;
	onBack: () => void;
}

const tiers = [
	{
		name: "Free",
		features: ["Up to 50 Cargo items", "Up to 10 Meals", "1 Supply list"],
	},
	{
		name: "Crew Member",
		features: [
			"Unlimited Cargo",
			"Unlimited Meals",
			"Unlimited lists + AI scans",
		],
		highlight: true,
	},
];

/**
 * Step 5 — Full-screen launch card.
 * Fires canvas confetti on "Begin Mission" before closing the tour.
 */
export function Step5_Launch({ onComplete, onSkip, onBack }: Step5Props) {
	function handleBeginMission() {
		fireConfetti();
		// Short delay so confetti is visible before overlay fades
		setTimeout(onComplete, 500);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal card stops backdrop click-through; keyboard nav is handled globally in OnboardingTour
		<div
			className="relative z-10 w-full max-w-lg mx-4 bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			{/* Progress fill */}
			<div className="h-1 w-full bg-hyper-green" />

			<div className="p-6 md:p-8">
				{/* Headline */}
				<div className="flex items-center gap-3 mb-5">
					<div className="w-10 h-10 rounded-full bg-hyper-green/20 flex items-center justify-center">
						<svg
							className="w-5 h-5 text-hyper-green"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
					<div>
						<h2 className="text-xl font-bold text-carbon dark:text-white">
							Mission ready.
						</h2>
						<p className="text-xs text-muted mt-0.5">Tour complete</p>
					</div>
				</div>

				{/* Credits line */}
				<p className="text-sm text-carbon/80 dark:text-white/80 mb-4">
					Scans and AI features use credits. Purchase as you go, or upgrade for
					unlimited access.
				</p>

				{/* Welcome voucher */}
				<div className="bg-hyper-green/10 border border-hyper-green/30 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3">
					<div>
						<p className="text-xs font-semibold text-carbon dark:text-white mb-0.5">
							Free credits — welcome gift
						</p>
						<p className="text-[11px] text-muted">
							Use at checkout to claim your first Supply Run free.
						</p>
					</div>
					<span className="shrink-0 font-bold text-hyper-green text-sm tracking-widest font-mono">
						WELCOME60
					</span>
				</div>

				{/* Tier comparison */}
				<div className="grid grid-cols-2 gap-3 mb-5">
					{tiers.map((tier) => (
						<div
							key={tier.name}
							className={`rounded-xl p-3 border ${
								tier.highlight
									? "border-hyper-green/40 bg-hyper-green/5"
									: "border-platinum dark:border-white/10"
							}`}
						>
							<p
								className={`text-xs font-bold mb-2 ${
									tier.highlight
										? "text-hyper-green"
										: "text-carbon dark:text-white"
								}`}
							>
								{tier.name}
							</p>
							<ul className="space-y-1">
								{tier.features.map((f) => (
									<li
										key={f}
										className="text-[11px] text-muted flex items-start gap-1.5"
									>
										<span className="text-hyper-green mt-0.5">·</span>
										{f}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				{/* Tech insight */}
				<p className="text-[11px] text-muted italic border-l-2 border-hyper-green/40 pl-2.5 mb-6">
					Your first Supply Run is on us — use code{" "}
					<span className="text-hyper-green font-mono font-bold">
						WELCOME60
					</span>{" "}
					for free credits.
				</p>

				{/* Navigation */}
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={onBack}
							className="px-3 py-2 text-sm font-medium text-muted hover:text-carbon dark:hover:text-white border border-platinum dark:border-white/20 rounded-lg transition-colors"
						>
							← Back
						</button>
						<Link
							to="/hub/pricing"
							onClick={onSkip}
							className="px-3 py-2 text-sm font-medium text-muted hover:text-carbon dark:hover:text-white border border-platinum dark:border-white/20 rounded-lg transition-colors"
						>
							View Pricing
						</Link>
					</div>
					<button
						type="button"
						onClick={handleBeginMission}
						className="px-6 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm"
					>
						Begin Mission
					</button>
				</div>
			</div>
		</div>
	);
}
