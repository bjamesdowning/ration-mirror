import { Sparkles } from "lucide-react";
import { useState } from "react";

interface GenerateMealButtonProps {
	/** Callback when generation is triggered (for future AI integration) */
	onGenerate?: () => void;
}

/**
 * AI-powered meal generation button.
 * Currently a placeholder that shows "Coming Soon" modal.
 * Future: Will trigger AI meal generation based on available pantry inventory.
 */
export function GenerateMealButton({ onGenerate }: GenerateMealButtonProps) {
	const [showModal, setShowModal] = useState(false);

	const handleClick = () => {
		if (onGenerate) {
			onGenerate();
		} else {
			setShowModal(true);
		}
	};

	return (
		<>
			<button
				type="button"
				onClick={handleClick}
				className="
					flex items-center gap-2 px-4 py-3 
					bg-hyper-green text-carbon font-semibold rounded-lg
					shadow-glow-sm hover:shadow-glow transition-all
					active:scale-95
				"
			>
				<Sparkles className="w-4 h-4" />
				Generate Meal
			</button>

			{/* Coming Soon Modal */}
			{showModal && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 backdrop-blur-sm animate-fade-in"
					role="dialog"
					aria-modal="true"
					aria-labelledby="generate-meal-title"
				>
					{/* Backdrop overlay - clickable to close */}
					<button
						type="button"
						className="absolute inset-0 bg-transparent cursor-default"
						onClick={() => setShowModal(false)}
						aria-label="Close modal"
					/>
					<div className="glass-panel rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl relative z-10">
						<div className="w-16 h-16 mx-auto mb-6 rounded-full bg-hyper-green/20 flex items-center justify-center">
							<Sparkles className="w-8 h-8 text-hyper-green" />
						</div>
						<h3
							id="generate-meal-title"
							className="text-xl font-bold text-carbon mb-2"
						>
							AI Meal Generation
						</h3>
						<p className="text-muted mb-6">
							This feature is coming soon! Our AI will analyze your pantry
							inventory and suggest delicious meals you can make with what you
							have.
						</p>
						<div className="space-y-3">
							<div className="flex items-center gap-2 text-sm text-muted">
								<span className="w-2 h-2 rounded-full bg-hyper-green" />
								Analyzes your available ingredients
							</div>
							<div className="flex items-center gap-2 text-sm text-muted">
								<span className="w-2 h-2 rounded-full bg-hyper-green" />
								Suggests complete meal recipes
							</div>
							<div className="flex items-center gap-2 text-sm text-muted">
								<span className="w-2 h-2 rounded-full bg-hyper-green" />
								Minimizes food waste
							</div>
						</div>
						<button
							type="button"
							onClick={() => setShowModal(false)}
							className="mt-8 px-6 py-3 bg-platinum text-carbon font-medium rounded-lg hover:bg-platinum/80 transition-colors"
						>
							Got it
						</button>
					</div>
				</div>
			)}
		</>
	);
}
