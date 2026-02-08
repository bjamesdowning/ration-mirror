import type { ReactNode } from "react";

export interface FloatingAction {
	/** Unique identifier for this action */
	id: string;
	/** Icon to display (React node) */
	icon: ReactNode;
	/** Text label for the action */
	label: string;
	/** Action handler */
	onClick?: () => void;
	/** If true, this is the primary/emphasized action */
	primary?: boolean;
	/** Visual style variant */
	variant?: "default" | "primary" | "danger";
	/** If true, button is disabled */
	disabled?: boolean;
}

interface FloatingActionBarProps {
	/** Actions to display in the bar */
	actions: FloatingAction[];
	/** Optional className for container */
	className?: string;
	/** Hide the FAB (e.g., when a sheet is open) */
	hidden?: boolean;
}

/**
 * Floating Action Bar (FAB) - Mobile-optimized bottom action bar.
 * Follows the "Thumb Zone" design principle, placing primary actions
 * within easy reach at the bottom of the viewport.
 *
 * Part of Option B: Unified Control Bar UI redesign.
 */
export function FloatingActionBar({
	actions,
	className = "",
	hidden = false,
}: FloatingActionBarProps) {
	if (actions.length === 0 || hidden) return null;

	return (
		<div
			className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 md:hidden ${className}`}
		>
			<div className="flex items-center gap-2 bg-ceramic/95 dark:bg-carbon/95 backdrop-blur-md rounded-2xl px-3 py-2 shadow-2xl border border-carbon/10 dark:border-white/10">
				{actions.map((action) => (
					<button
						key={action.id}
						type="button"
						onClick={action.onClick}
						disabled={action.disabled}
						className={`
							flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all min-w-[44px] min-h-[44px] justify-center
							${
								action.primary || action.variant === "primary"
									? "bg-hyper-green text-carbon shadow-glow-sm hover:shadow-glow"
									: action.variant === "danger"
										? "bg-red-500/90 text-white shadow-glow-sm hover:bg-red-500 hover:shadow-glow"
										: "bg-platinum dark:bg-white/20 text-carbon dark:text-white hover:bg-platinum/80 dark:hover:bg-white/30"
							}
							${action.disabled ? "opacity-50 cursor-not-allowed" : ""}
						`}
						title={action.label}
					>
						<span className="w-6 h-6 flex items-center justify-center shrink-0">
							{action.icon}
						</span>
						{action.primary || action.variant === "primary" ? (
							<span className="hidden xs:inline">{action.label}</span>
						) : null}
					</button>
				))}
			</div>
		</div>
	);
}
