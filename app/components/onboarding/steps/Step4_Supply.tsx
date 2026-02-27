import { TechInsight, TourCard } from "../TourCard";

interface StepProps {
	step: number;
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export function Step4_Supply({ step, onNext, onBack, onSkip }: StepProps) {
	return (
		<TourCard
			step={step}
			onNext={onNext}
			onBack={onBack}
			onSkip={onSkip}
			nextLabel="Next →"
		>
			<div className="flex items-center gap-2 mb-3">
				<div className="w-7 h-7 rounded-lg bg-hyper-green/20 flex items-center justify-center">
					<svg
						className="w-4 h-4 text-hyper-green"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
						/>
					</svg>
				</div>
				<span className="text-[11px] font-bold text-hyper-green uppercase tracking-wider">
					Supply
				</span>
			</div>

			<h3 className="text-base font-bold text-carbon dark:text-white mb-1.5">
				Your shopping list, auto-generated.
			</h3>
			<p className="text-sm text-carbon/80 dark:text-white/80">
				Supply reads from two sources: your{" "}
				<span className="text-hyper-green font-medium">Manifest</span> meal plan
				and any meals or provisions selected directly in{" "}
				<span className="text-hyper-green font-medium">Galley</span>. Both are
				cross-referenced against your Cargo levels to generate exactly what you
				need to buy.
			</p>

			<TechInsight>
				Hybrid search (boolean + semantic) ensures nothing is missed, even with
				partial or misspelled ingredient names.
			</TechInsight>
		</TourCard>
	);
}
