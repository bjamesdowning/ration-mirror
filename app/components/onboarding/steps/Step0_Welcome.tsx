interface Step0Props {
	onBegin: () => void;
	onSkip: () => void;
}

const capabilities = [
	"Scan receipts, fridge photos, and PDFs straight into your pantry",
	"Import meals from TikTok, YouTube, websites, or a photo",
	"Run multiple kitchens and invite others to join them",
	"Set nutrient goals and log intake privately — even in a shared kitchen",
	"Ask Copilot with full context on your kitchen",
] as const;

/**
 * Step 0 — Full-screen welcome modal.
 * Brand-led promise (pantry · recipes · shopping · macros) + capability differentiators.
 */
export function Step0_Welcome({ onBegin, onSkip }: Step0Props) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal card stops backdrop click-through; keyboard nav is handled globally in OnboardingTour
		<div
			className="relative z-10 w-full max-w-lg mx-4 bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			{/* Accent bar */}
			<div className="h-1 w-full bg-hyper-green" />

			<div className="p-6 md:p-8">
				{/* Brand mark + title */}
				<div className="flex flex-col items-center text-center mb-5">
					<img
						src="/static/ration-logo.png"
						alt=""
						width={56}
						height={56}
						className="w-14 h-14 mb-3"
						decoding="async"
					/>
					<h2 className="text-2xl font-bold text-carbon dark:text-white tracking-tight leading-tight">
						Ration
					</h2>
					<p className="text-xs font-semibold text-hyper-green mt-1.5">
						Waste less. Shop the delta.
					</p>
				</div>

				{/* Core loop pitch — macros as a pillar */}
				<p className="text-sm text-carbon/80 dark:text-white/80 text-center mb-5">
					Pantry, recipes, shopping, and macros in one loop — grounded in what
					you have and eat.
				</p>

				{/* Capabilities */}
				<ul className="space-y-2.5 mb-6 text-left">
					{capabilities.map((line) => (
						<li key={line} className="flex items-start gap-2.5">
							<span
								className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-hyper-green"
								aria-hidden="true"
							/>
							<span className="text-xs text-muted leading-snug">{line}</span>
						</li>
					))}
				</ul>

				{/* CTAs */}
				<div className="flex items-center justify-between gap-3">
					<button
						type="button"
						onClick={onSkip}
						className="text-xs text-muted hover:text-carbon dark:hover:text-white transition-colors"
					>
						Skip tour
					</button>
					<button
						type="button"
						onClick={onBegin}
						className="px-6 py-2.5 bg-hyper-green text-on-hyper-green font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm"
					>
						Begin Tour →
					</button>
				</div>
			</div>
		</div>
	);
}
