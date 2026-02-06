import type { ReactNode } from "react";

type StatusColor = "green" | "yellow" | "red" | "gray";

interface CompactItemCardProps {
	/** Item name/title */
	name: string;
	/** Primary metric (quantity, prep time, etc.) */
	metric: string;
	/** Status indicator color */
	status?: StatusColor;
	/** Optional secondary text */
	subtitle?: string;
	/** Status indicator tooltip */
	statusTooltip?: string;
	/** Click handler for the card */
	onClick?: () => void;
	/** Optional content to render in the card */
	children?: ReactNode;
	/** Whether this card is selected/active */
	isSelected?: boolean;
	/** Optional toggle handler for selection */
	onToggleSelect?: () => void;
}

const STATUS_COLORS: Record<StatusColor, string> = {
	green: "bg-hyper-green",
	yellow: "bg-warning",
	red: "bg-danger",
	gray: "bg-muted",
};

/**
 * CompactItemCard - A minimal, scan-optimized card for grid layouts.
 * Displays name, key metric, and status in a compact format.
 * Optimized for 2-column mobile grids.
 *
 * Part of Option B: Unified Control Bar UI redesign.
 */
export function CompactItemCard({
	name,
	metric,
	status = "gray",
	subtitle,
	statusTooltip,
	onClick,
	children,
	isSelected,
	onToggleSelect,
}: CompactItemCardProps) {
	return (
		<button
			type="button"
			className={`
				relative glass-panel rounded-xl p-3 transition-all cursor-pointer text-left w-full
				hover:shadow-md active:scale-[0.98]
				${isSelected ? "ring-2 ring-hyper-green" : ""}
			`}
			onClick={onClick}
		>
			{/* Selection toggle */}
			{onToggleSelect && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onToggleSelect();
					}}
					className={`
						absolute top-2 left-2 z-10 w-6 h-6 rounded-md flex items-center justify-center
						text-xs font-bold transition-all border
						${
							isSelected
								? "bg-hyper-green text-carbon border-hyper-green"
								: "bg-platinum/70 dark:bg-white/10 text-muted border-carbon/20 dark:border-white/20 hover:border-hyper-green"
						}
					`}
				>
					{isSelected ? "✓" : "+"}
				</button>
			)}

			{/* Status dot */}
			<div className="flex items-start justify-between mb-2">
				<div
					className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status]} ${onToggleSelect ? "ml-8" : ""}`}
					title={statusTooltip}
				/>
				<span className="text-lg font-bold text-carbon dark:text-white">
					{metric}
				</span>
			</div>

			{/* Name */}
			<h4
				className={`font-semibold text-carbon dark:text-white truncate ${onToggleSelect ? "pl-8" : ""}`}
				title={name}
			>
				{name}
			</h4>

			{/* Subtitle */}
			{subtitle && (
				<p
					className={`text-xs text-muted truncate mt-0.5 ${onToggleSelect ? "pl-8" : ""}`}
				>
					{subtitle}
				</p>
			)}

			{/* Optional children */}
			{children}
		</button>
	);
}

/**
 * Helper to convert status values to StatusColor
 */
export function getStatusColor(
	status?: string | null,
	expiresAt?: string | Date | null,
): StatusColor {
	// Check explicit status first
	if (status === "biohazard") return "red";
	if (status === "decay_imminent") return "yellow";
	if (status === "stable") return "green";

	// Infer from expiration
	if (expiresAt) {
		const expiry =
			typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
		const daysUntil = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
		if (daysUntil < 0) return "red";
		if (daysUntil < 3) return "yellow";
		return "green";
	}

	return "green"; // Default to green (no expiry = stable)
}
