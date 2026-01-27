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
		if (percentage > 80) return "bg-success/10 text-success";
		if (percentage >= 50) return "bg-warning/10 text-warning";
		return "bg-danger/10 text-danger";
	};

	// Size classes
	const getSizeClasses = () => {
		switch (size) {
			case "sm":
				return "text-xs px-2 py-1";
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
					text-data font-bold rounded-full
					${getColorClass()}
					${getSizeClasses()}
				`}
			>
				{percentage}%
			</div>
			{canMake && percentage === 100 && (
				<span className="text-xs text-success">Ready</span>
			)}
		</div>
	);
}
