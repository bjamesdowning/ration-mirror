import type { ReactNode } from "react";
import { CloseIcon } from "~/components/icons/PageIcons";

const TOTAL_STEPS = 7;
const STEP_INDICES = ["0", "1", "2", "3", "4", "5", "6"] as const;

interface TourCardProps {
	step: number;
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
	nextLabel?: string;
	hideBack?: boolean;
	children: ReactNode;
}

/**
 * Floating card used on all tour steps (steps 1–5).
 * On mobile: full-width bottom sheet.
 * On desktop: compact floating card, max-w-sm.
 */
export function TourCard({
	step,
	onNext,
	onBack,
	onSkip,
	nextLabel = "Next →",
	hideBack = false,
	children,
}: TourCardProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal card stops backdrop click-through; keyboard nav is handled globally in OnboardingTour
		<div
			className="pointer-events-auto fixed bottom-0 left-0 right-0 md:bottom-6 md:right-6 md:left-auto md:w-80 z-[101] bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			{/* Progress bar */}
			<div className="h-1 bg-platinum dark:bg-white/10 rounded-t-2xl md:rounded-t-2xl overflow-hidden">
				<div
					className="h-full bg-hyper-green transition-all duration-500"
					style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
				/>
			</div>

			{/* Header */}
			<div className="flex items-center justify-between px-5 pt-4 pb-2">
				<div className="flex items-center gap-2">
					{STEP_INDICES.map((sid, i) => (
						<span
							key={sid}
							className={`block rounded-full transition-all duration-300 ${
								i === step
									? "w-5 h-2 bg-hyper-green"
									: i < step
										? "w-2 h-2 bg-hyper-green/40"
										: "w-2 h-2 bg-platinum dark:bg-white/20"
							}`}
						/>
					))}
				</div>
				<button
					type="button"
					onClick={onSkip}
					className="p-1.5 rounded-full text-muted hover:text-carbon dark:hover:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors"
					aria-label="Skip tour"
				>
					<CloseIcon className="w-3.5 h-3.5" />
				</button>
			</div>

			{/* Step content */}
			<div className="px-5 pb-4 flex-1">{children}</div>

			{/* Navigation */}
			<div className="px-5 pb-5 flex items-center justify-between gap-3 border-t border-platinum/50 dark:border-white/10 pt-4">
				<button
					type="button"
					onClick={onSkip}
					className="text-xs text-muted hover:text-carbon dark:hover:text-white transition-colors"
				>
					Skip tour
				</button>
				<div className="flex items-center gap-2">
					{!hideBack && (
						<button
							type="button"
							onClick={onBack}
							className="px-3 py-2 text-sm font-medium text-muted hover:text-carbon dark:hover:text-white border border-platinum dark:border-white/20 rounded-lg transition-colors"
						>
							← Back
						</button>
					)}
					<button
						type="button"
						onClick={onNext}
						className="px-4 py-2 text-sm font-semibold bg-hyper-green text-carbon rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
					>
						{nextLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * Tech insight chip shown at the bottom of step content.
 * Soft styling — reads as a footnote.
 */
export function TechInsight({ children }: { children: ReactNode }) {
	return (
		<p className="mt-3 text-[11px] text-muted italic border-l-2 border-hyper-green/40 pl-2.5">
			{children}
		</p>
	);
}
