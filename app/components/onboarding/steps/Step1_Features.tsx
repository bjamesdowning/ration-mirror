import { FeatureEnablementForm } from "~/components/feature-enablement/FeatureEnablementForm";

interface Step1FeaturesProps {
	onContinue: () => void;
	onSkip: () => void;
}

/**
 * Onboarding step — feature enablement (AI + Macro Tracking).
 * Placed after Welcome, before product tour spotlights.
 */
export function Step1_Features({ onContinue, onSkip }: Step1FeaturesProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal card stops backdrop click-through
		<div
			className="relative z-10 w-full max-w-lg mx-4 bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			<div className="h-1 w-full bg-hyper-green" />
			<div className="p-6 md:p-8">
				<h2 className="text-xl font-bold text-carbon dark:text-white leading-tight mb-1">
					Enable your features
				</h2>
				<p className="text-xs text-muted mb-5">
					Choose what Ration can do for you. Everything useful is on by default
					— turn something off only if you do not want it.
				</p>
				<FeatureEnablementForm
					variant="onboarding"
					onContinue={onContinue}
					continueLabel="Agree & Continue"
				/>
				<div className="mt-4 flex justify-start">
					<button
						type="button"
						onClick={onSkip}
						className="text-xs text-muted hover:text-carbon dark:hover:text-white transition-colors"
					>
						Skip tour
					</button>
				</div>
			</div>
		</div>
	);
}
