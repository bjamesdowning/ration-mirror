import { TechInsight, TourCard } from "../TourCard";

interface StepProps {
	step: number;
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export function Step1_Groups({ step, onNext, onBack, onSkip }: StepProps) {
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
							d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
						/>
					</svg>
				</div>
				<span className="text-[11px] font-bold text-hyper-green uppercase tracking-wider">
					Groups
				</span>
			</div>

			<h3 className="text-base font-bold text-carbon dark:text-white mb-1.5">
				Groups — your household hub.
			</h3>
			<p className="text-sm text-carbon/80 dark:text-white/80">
				Cargo, Galley, Manifest, Supply, and credits all live in a group. Your
				personal group starts solo. Crew Member lets you create more groups and
				invite family, roommates, or collaborators to share the same pantry,
				recipes, and meal plan.
			</p>

			<TechInsight>
				Manage groups and invite links in Settings → Group.
			</TechInsight>
		</TourCard>
	);
}
