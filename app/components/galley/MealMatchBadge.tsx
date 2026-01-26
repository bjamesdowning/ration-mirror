interface MealMatchBadgeProps {
	percentage: number;
	canMake: boolean;
	size?: "sm" | "md" | "lg";
}

/**
 * Displays a match percentage badge with color coding.
 * Green for 100%, yellow for 50-99%, red for <50%
 */
export function MealMatchBadge({
	percentage,
	canMake,
	size = "md",
}: MealMatchBadgeProps) {
	// Determine color based on percentage
	const getColorClass = () => {
		if (percentage === 100)
			return "bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/50";
		if (percentage >= 75)
			return "bg-yellow-500/20 text-yellow-500 border-yellow-500/50";
		if (percentage >= 50)
			return "bg-orange-500/20 text-orange-500 border-orange-500/50";
		return "bg-red-500/20 text-red-500 border-red-500/50";
	};

	// Size classes
	const getSizeClasses = () => {
		switch (size) {
			case "sm":
				return "text-[10px] px-2 py-0.5";
			case "lg":
				return "text-sm px-4 py-2";
			default:
				return "text-xs px-3 py-1";
		}
	};

	return (
		<div className="flex items-center gap-2">
			<div
				className={`
					font-mono font-bold uppercase tracking-wider
					border rounded
					${getColorClass()}
					${getSizeClasses()}
				`}
			>
				{percentage}%
			</div>
			{canMake && percentage === 100 && (
				<span className="text-[10px] text-[#39FF14]/60 uppercase tracking-wide">
					Ready
				</span>
			)}
		</div>
	);
}
