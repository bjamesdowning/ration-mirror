interface TourOverlayProps {
	onSkip: () => void;
	children: React.ReactNode;
}

/**
 * Full-screen dimming overlay for the onboarding tour.
 * On mobile the entire screen is dimmed with children centered.
 * On desktop the dim layer is present but the spotlight logic lives in the
 * individual step cards (which position themselves near their target).
 */
export function TourOverlay({ onSkip, children }: TourOverlayProps) {
	return (
		<div
			className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-carbon/70 backdrop-blur-sm animate-fade-in"
			role="dialog"
			aria-modal="true"
			aria-label="Onboarding tour"
		>
			{/* Backdrop tap = skip confirmation handled by children */}
			<button
				type="button"
				className="absolute inset-0 cursor-default"
				onClick={onSkip}
				aria-label="Skip tour"
				tabIndex={-1}
			/>
			{children}
		</div>
	);
}
