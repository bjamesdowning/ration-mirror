import { TechInsight, TourCard } from "../TourCard";

interface StepProps {
	step: number;
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export function Step3_Manifest({ step, onNext, onBack, onSkip }: StepProps) {
	return (
		<TourCard step={step} onNext={onNext} onBack={onBack} onSkip={onSkip}>
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
							d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
						/>
					</svg>
				</div>
				<span className="text-[11px] font-bold text-hyper-green uppercase tracking-wider">
					Manifest
				</span>
			</div>

			<h3 className="text-base font-bold text-carbon dark:text-white mb-1.5">
				Plan the week. Feed the system.
			</h3>
			<p className="text-sm text-carbon/80 dark:text-white/80">
				Schedule meals into daily slots. The Manifest is the source of truth
				your Supply list reads from.
			</p>

			<TechInsight>
				Manifest data drives automated gap analysis — no manual list-building
				needed.
			</TechInsight>
		</TourCard>
	);
}
