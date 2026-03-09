import { TechInsight, TourCard } from "../TourCard";

interface StepProps {
	step: number;
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export function Step2_Galley({ step, onNext, onBack, onSkip }: StepProps) {
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
							d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
						/>
					</svg>
				</div>
				<span className="text-[11px] font-bold text-hyper-green uppercase tracking-wider">
					Galley
				</span>
			</div>

			<h3 className="text-base font-bold text-carbon dark:text-white mb-1.5">
				Your recipe book, ingredient-aware.
			</h3>
			<p className="text-sm text-carbon/80 dark:text-white/80">
				Build meals and link each ingredient directly to Cargo. Ration shows you
				what you can cook right now based on what's in stock.
			</p>

			<TechInsight>
				Ingredients are matched to Cargo using semantic vectors — "canned
				tomatoes" resolves to "tinned tomatoes" automatically. Match Mode then
				highlights meals you can cook right now.
			</TechInsight>
		</TourCard>
	);
}
