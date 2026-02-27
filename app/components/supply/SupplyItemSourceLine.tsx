import { Link } from "react-router";

interface SupplyItemSourceLineProps {
	sourceMealName: string | null | undefined;
	sourceMealNames?: string[] | null;
	sourceMealSources?: { id: string; name: string }[];
}

/**
 * Displays the source of a supply item on a second line.
 * Shows "From: [Meal Name]" (linked to Galley) for meal-sourced items, "Added manually" otherwise.
 * Part of Option B: two-line layout for supply list source indicators.
 */
export function SupplyItemSourceLine({
	sourceMealName,
	sourceMealNames,
	sourceMealSources,
}: SupplyItemSourceLineProps) {
	const MAX_VISIBLE_MEALS = 2;

	// Prefer structured sources (with IDs for linking) over plain name arrays
	const sources =
		Array.isArray(sourceMealSources) && sourceMealSources.length > 0
			? sourceMealSources
			: Array.isArray(sourceMealNames) && sourceMealNames.length > 0
				? sourceMealNames.map((name) => ({ id: null, name }))
				: sourceMealName
					? [{ id: null, name: sourceMealName }]
					: [];

	const allNames = sources.map((s) => s.name);
	const ariaLabel =
		sources.length === 0
			? "Source: Added manually"
			: `Source meals: ${allNames.join(", ")}`;

	if (sources.length === 0) {
		return (
			<span className="block text-xs text-muted mt-0.5 pl-8" title={ariaLabel}>
				Added manually
			</span>
		);
	}

	const visibleSources = sources.slice(0, MAX_VISIBLE_MEALS);
	const hiddenCount = sources.length - MAX_VISIBLE_MEALS;

	return (
		<span className="block text-xs text-muted mt-0.5 pl-8" title={ariaLabel}>
			{"From: "}
			{visibleSources.map((source, index) => (
				<span key={source.id ?? source.name}>
					{index > 0 && ", "}
					{source.id ? (
						<Link
							to={`/hub/galley/${source.id}`}
							className="text-hyper-green hover:underline"
							aria-label={`View ${source.name} in Galley`}
						>
							{source.name}
						</Link>
					) : (
						source.name
					)}
				</span>
			))}
			{hiddenCount > 0 && ` +${hiddenCount} more`}
		</span>
	);
}
