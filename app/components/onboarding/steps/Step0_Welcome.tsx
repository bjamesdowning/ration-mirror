interface Step0Props {
	onBegin: () => void;
	onSkip: () => void;
}

const nomenclature = [
	{
		term: "Hub",
		def: "Your mission control — stats, widgets, and quick actions.",
	},
	{
		term: "Cargo",
		def: "Your pantry. Everything you stock, tracked in real time.",
	},
	{
		term: "Galley",
		def: "Your recipe book. Meals mapped to Cargo ingredients.",
	},
	{
		term: "Manifest",
		def: "Your weekly meal plan. The source of truth for Supply.",
	},
	{
		term: "Supply",
		def: "Your auto-generated shopping list based on your Manifest.",
	},
];

/**
 * Step 0 — Full-screen welcome modal.
 * Introduces the mission, nomenclature, and workflow chain.
 */
const WORKFLOW_STEPS = [
	{ id: "cargo-label", item: "Cargo" },
	{ id: "arrow-1", item: "→" },
	{ id: "galley-label", item: "Galley" },
	{ id: "arrow-2", item: "→" },
	{ id: "manifest-label", item: "Manifest" },
	{ id: "arrow-3", item: "→" },
	{ id: "supply-label", item: "Supply" },
];

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
				{/* Logo mark + headline */}
				<div className="flex items-center gap-3 mb-5">
					<div className="w-10 h-10 rounded-full bg-hyper-green/20 flex items-center justify-center">
						<svg
							className="w-5 h-5 text-hyper-green"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
					</div>
					<div>
						<h2 className="text-xl font-bold text-carbon dark:text-white leading-tight">
							Welcome to Ration.
						</h2>
						<p className="text-xs text-muted mt-0.5">Orbital Supply Chain</p>
					</div>
				</div>

				{/* Pitch */}
				<p className="text-sm text-carbon/80 dark:text-white/80 mb-5">
					Ration connects your pantry, recipes, and weekly meal plan into one
					intelligent system — so you always know what you have, what you can
					cook, and exactly what to buy.
				</p>

				{/* Nomenclature */}
				<div className="space-y-2 mb-5">
					{nomenclature.map(({ term, def }) => (
						<div key={term} className="flex items-start gap-2.5">
							<span className="shrink-0 mt-0.5 w-16 text-[11px] font-bold text-hyper-green uppercase tracking-wider">
								{term}
							</span>
							<span className="text-xs text-muted">{def}</span>
						</div>
					))}
				</div>

				{/* Workflow chain */}
				<div className="bg-platinum/40 dark:bg-white/5 rounded-xl px-4 py-3 mb-5">
					<p className="text-[11px] text-muted font-medium mb-1.5">
						Example workflow
					</p>
					<div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-carbon dark:text-white">
						{WORKFLOW_STEPS.map(({ id, item }) => (
							<span
								key={id}
								className={item === "→" ? "text-muted" : "text-hyper-green"}
							>
								{item}
							</span>
						))}
					</div>
				</div>

				{/* Tech insight */}
				<p className="text-[11px] text-muted italic border-l-2 border-hyper-green/40 pl-2.5 mb-6">
					Ration runs at the edge — every action is instant, every
					recommendation is AI-powered.
				</p>

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
						className="px-6 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm"
					>
						Begin Tour →
					</button>
				</div>
			</div>
		</div>
	);
}
