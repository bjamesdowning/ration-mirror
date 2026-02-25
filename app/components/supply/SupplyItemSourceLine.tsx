interface SupplyItemSourceLineProps {
	sourceMealName: string | null | undefined;
	sourceMealNames?: string[] | null;
}

/**
 * Displays the source of a supply item on a second line.
 * Shows "From: [Meal Name]" for meal-sourced items, "Added manually" otherwise.
 * Part of Option B: two-line layout for supply list source indicators.
 */
export function SupplyItemSourceLine({
	sourceMealName,
	sourceMealNames,
}: SupplyItemSourceLineProps) {
	const MAX_VISIBLE_MEALS = 2;
	const names =
		Array.isArray(sourceMealNames) && sourceMealNames.length > 0
			? sourceMealNames
			: sourceMealName
				? [sourceMealName]
				: [];

	const text =
		names.length === 0
			? "Added manually"
			: names.length <= MAX_VISIBLE_MEALS
				? `From: ${names.join(", ")}`
				: `From: ${names.slice(0, MAX_VISIBLE_MEALS).join(", ")} +${names.length - MAX_VISIBLE_MEALS} more`;

	const ariaLabel =
		names.length === 0
			? "Source: Added manually"
			: `Source meals: ${names.join(", ")}`;

	return (
		<span className="block text-xs text-muted mt-0.5 pl-8" title={ariaLabel}>
			{text}
		</span>
	);
}
