import type { ReactNode } from "react";
import { Link } from "react-router";

const MODAL_MAX_WIDTH = {
	sm: "md:max-w-md",
	md: "md:max-w-2xl",
	lg: "md:max-w-4xl",
} as const;

/**
 * Reusable modal shell for AI features. Provides consistent backdrop, card, header (icon + title + subtitle), and close. Body is passed as children.
 */
export interface AIFeatureModalProps {
	open: boolean;
	onClose: () => void;
	title: string;
	subtitle?: string;
	icon: ReactNode;
	children: ReactNode;
	/** Max width of the modal card */
	maxWidth?: keyof typeof MODAL_MAX_WIDTH;
	/** Optional id for the title element (a11y) */
	titleId?: string;
}

export function AIFeatureModal({
	open,
	onClose,
	title,
	subtitle,
	icon,
	children,
	maxWidth = "md",
	titleId,
}: AIFeatureModalProps) {
	if (!open) return null;

	const id = titleId ?? "ai-feature-modal-title";

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-carbon/80 backdrop-blur-sm animate-fade-in"
			role="dialog"
			aria-modal="true"
			aria-labelledby={id}
		>
			<button
				type="button"
				className="absolute inset-0 bg-transparent cursor-default"
				onClick={onClose}
				aria-label="Close modal"
			/>

			<div
				className={`bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-2xl w-full ${MODAL_MAX_WIDTH[maxWidth]} max-h-[90vh] md:max-h-[85vh] overflow-y-auto m-4 relative z-10 flex flex-col shadow-xl`}
			>
				<div className="p-6 border-b border-platinum dark:border-white/10 flex justify-between items-center sticky top-0 bg-ceramic/95 dark:bg-[#1A1A1A]/95 backdrop-blur z-20">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-full bg-hyper-green/20 flex items-center justify-center">
							{icon}
						</div>
						<div>
							<h3
								id={id}
								className="text-xl font-bold text-carbon dark:text-white"
							>
								{title}
							</h3>
							{subtitle ? (
								<p className="text-xs text-muted">{subtitle}</p>
							) : null}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 text-carbon dark:text-white hover:bg-platinum dark:hover:bg-white/10 rounded-full transition-colors"
						aria-label="Close modal"
					>
						✕
					</button>
				</div>

				<div className="flex flex-col flex-1">{children}</div>
			</div>
		</div>
	);
}

/**
 * Credit-gated intro view: description, cost/credits copy, and footer with Cancel + (Continue or Pricing).
 * Use as the first step of any AI feature modal when the feature consumes credits.
 */
export interface AIFeatureIntroViewProps {
	/** Short description of what the feature does */
	description: string;
	/** Credit cost per use (e.g. 2) */
	cost: number;
	/** Label for the cost line, e.g. "per scan", "per import", "per generation" */
	costLabel: string;
	/** Current group credit balance */
	credits: number;
	onCancel: () => void;
	/** Called when user clicks Continue (only shown when credits >= cost) */
	onConfirm: () => void;
	/** Label for the primary action when they have enough credits, e.g. "Continue", "Import Meal" */
	confirmLabel: string;
}

export function AIFeatureIntroView({
	description,
	cost,
	costLabel,
	credits,
	onCancel,
	onConfirm,
	confirmLabel,
}: AIFeatureIntroViewProps) {
	const hasEnoughCredits = credits >= cost;

	return (
		<>
			<div className="p-6 space-y-4">
				<p className="text-carbon/80 dark:text-white/80 text-sm">
					{description}
				</p>
				<p className="text-xs text-muted">
					Uses {cost} credit{cost !== 1 ? "s" : ""} {costLabel}.
				</p>
				<p className="text-xs text-muted">
					You have {credits} credit{credits !== 1 ? "s" : ""}.
				</p>
			</div>

			<div className="p-6 pt-0 flex flex-wrap gap-3 justify-end">
				<button
					type="button"
					onClick={onCancel}
					className="px-4 py-2.5 text-sm font-medium text-muted hover:text-carbon dark:hover:text-white border border-platinum dark:border-white/20 rounded-lg transition-colors"
				>
					Cancel
				</button>
				{hasEnoughCredits ? (
					<button
						type="button"
						onClick={onConfirm}
						className="px-6 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
					>
						{confirmLabel}
					</button>
				) : (
					<Link
						to="/hub/pricing"
						onClick={onCancel}
						className="px-6 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all inline-block text-center"
					>
						Pricing
					</Link>
				)}
			</div>
		</>
	);
}
