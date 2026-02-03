import type { ReactNode } from "react";

interface EmptyPanelProps {
	/** Icon or Emoji to display */
	icon: ReactNode;
	/** Main title of the empty state */
	title: string;
	/** Helper description text */
	description: string;
	/** Primary action button(s) */
	action?: ReactNode;
	/** Optional specific height class (default: py-16) */
	className?: string;
}

/**
 * Standardized "Orbital Luxury" Empty State Component.
 * Used when a list or grid has no items to display.
 */
export function EmptyPanel({
	icon,
	title,
	description,
	action,
	className = "py-16",
}: EmptyPanelProps) {
	return (
		<div className={`text-center glass-panel rounded-2xl ${className}`}>
			<div className="text-6xl mb-6 opacity-80">{icon}</div>
			<h3 className="text-display text-xl text-carbon mb-2 font-bold tracking-tight">
				{title}
			</h3>
			<p className="text-sm text-muted mb-6 max-w-md mx-auto leading-relaxed">
				{description}
			</p>
			{action && (
				<div className="flex flex-wrap justify-center gap-4">{action}</div>
			)}
		</div>
	);
}
