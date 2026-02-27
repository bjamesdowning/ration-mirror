import { TechInsight, TourCard } from "../TourCard";

interface StepProps {
	step: number;
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export function Step1_Cargo({ step, onNext, onBack, onSkip }: StepProps) {
	return (
		<TourCard step={step} onNext={onNext} onBack={onBack} onSkip={onSkip}>
			{/* Spotlight indicator */}
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
							d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
						/>
					</svg>
				</div>
				<span className="text-[11px] font-bold text-hyper-green uppercase tracking-wider">
					Cargo
				</span>
			</div>

			<h3 className="text-base font-bold text-carbon dark:text-white mb-1.5">
				Your pantry, always accurate.
			</h3>
			<p className="text-sm text-carbon/80 dark:text-white/80">
				Track everything by type (Dry / Frozen), quantity, and expiry date. Add
				in bulk by scanning a receipt — the AI does the parsing.
			</p>

			<TechInsight>
				OCR + LLM extracts item names, quantities, and units from a photo in
				seconds.
			</TechInsight>
		</TourCard>
	);
}
