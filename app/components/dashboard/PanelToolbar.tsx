import type { ReactNode } from "react";

interface PanelToolbarProps {
	/** Primary AI action button (Scan Item for Pantry, Generate Meal for Meals) */
	primaryAction?: ReactNode;
	/** Secondary action button (+ New Recipe, etc.) */
	secondaryAction?: ReactNode;
	/** Filter dropdown or controls */
	filterControls?: ReactNode;
	/** Additional controls for the right side */
	additionalControls?: ReactNode;
	/** Whether the quick-add form is currently visible */
	showQuickAdd?: boolean;
	/** Callback to toggle quick-add form visibility */
	onToggleQuickAdd?: () => void;
	/** Quick-add input placeholder text */
	quickAddPlaceholder?: string;
	/** Quick-add form content (rendered when showQuickAdd is true) */
	quickAddForm?: ReactNode;
}

/**
 * Unified toolbar component for dashboard panels (Pantry, Meals).
 * Provides consistent layout for actions, filters, and quick-add functionality.
 */
export function PanelToolbar({
	primaryAction,
	secondaryAction,
	filterControls,
	additionalControls,
	showQuickAdd,
	onToggleQuickAdd,
	quickAddPlaceholder = "Quick add...",
	quickAddForm,
}: PanelToolbarProps) {
	return (
		<div className="space-y-4">
			{/* Main Toolbar Row */}
			<div className="flex flex-wrap items-center gap-3">
				{/* Quick Add Toggle */}
				{onToggleQuickAdd && (
					<button
						type="button"
						onClick={onToggleQuickAdd}
						className={`
							flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
							${
								showQuickAdd
									? "bg-hyper-green text-carbon shadow-glow-sm"
									: "border-2 border-dashed border-carbon/20 text-muted hover:border-hyper-green hover:text-hyper-green"
							}
						`}
					>
						{showQuickAdd ? (
							<>
								<svg
									className="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
								Cancel
							</>
						) : (
							<>
								<svg
									className="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 4v16m8-8H4"
									/>
								</svg>
								{quickAddPlaceholder}
							</>
						)}
					</button>
				)}

				{/* Primary AI Action */}
				{primaryAction}

				{/* Spacer */}
				<div className="flex-1" />

				{/* Filter Controls */}
				{filterControls && (
					<div className="flex items-center gap-2">{filterControls}</div>
				)}

				{/* Additional Controls */}
				{additionalControls}

				{/* Secondary Action */}
				{secondaryAction}
			</div>

			{/* Quick Add Form (Collapsible) */}
			{showQuickAdd && quickAddForm && (
				<div className="glass-panel rounded-xl p-6 animate-fade-in">
					{quickAddForm}
				</div>
			)}
		</div>
	);
}
