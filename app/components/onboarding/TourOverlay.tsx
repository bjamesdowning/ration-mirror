interface TourOverlayProps {
	onSkip: () => void;
	children: React.ReactNode;
	/** When true, dims + blurs the screen (Step 0 and Step 5 full-screen moments). */
	fullscreen?: boolean;
}

/**
 * Overlay layer for the onboarding tour.
 *
 * Spotlight steps (1–4): very light scrim only — no blur, no centering —
 * so the user can see and read the actual page behind the tour card.
 *
 * Full-screen steps (0 and 5): dim + blur for focused attention.
 */
export function TourOverlay({
	onSkip,
	children,
	fullscreen = false,
}: TourOverlayProps) {
	return (
		<div
			className={`fixed inset-0 z-[100] animate-fade-in ${
				fullscreen
					? "flex items-center justify-center bg-carbon/70 backdrop-blur-sm"
					: "bg-carbon/10 pointer-events-none"
			}`}
			role="dialog"
			aria-modal="true"
			aria-label="Onboarding tour"
		>
			{/* Backdrop tap for full-screen steps */}
			{fullscreen && (
				<button
					type="button"
					className="absolute inset-0 cursor-default"
					onClick={onSkip}
					aria-label="Skip tour"
					tabIndex={-1}
				/>
			)}
			{children}
		</div>
	);
}
