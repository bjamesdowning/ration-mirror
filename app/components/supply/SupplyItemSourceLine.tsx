import { useState } from "react";
import { Link } from "react-router";

interface SupplyItemSourceLineProps {
	sourceMealName: string | null | undefined;
	sourceMealNames?: string[] | null;
	sourceMealSources?: { id: string; name: string }[];
}

/**
 * Displays the source of a supply item.
 * Desktop: inline "From: [Meal Name]" text.
 * Mobile: compact chip, expandable for full source list.
 */
export function SupplyItemSourceLine({
	sourceMealName,
	sourceMealNames,
	sourceMealSources,
}: SupplyItemSourceLineProps) {
	const MAX_VISIBLE_MEALS = 2;
	const [isExpanded, setIsExpanded] = useState(false);

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
			<>
				<span
					className="hidden md:block text-xs text-muted mt-0.5 pl-8 md:pl-11"
					title={ariaLabel}
				>
					Added manually
				</span>
				<span className="md:hidden block text-xs text-muted mt-1 pl-11">
					Manual
				</span>
			</>
		);
	}

	const visibleSources = sources.slice(0, MAX_VISIBLE_MEALS);
	const hiddenCount = sources.length - MAX_VISIBLE_MEALS;
	const chipLabel = sources.length === 1 ? "1 meal" : `${sources.length} meals`;

	return (
		<>
			{/* Desktop: full inline source line */}
			<span
				className="hidden md:block text-xs text-muted mt-0.5 pl-8 md:pl-11"
				title={ariaLabel}
			>
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

			{/* Mobile: compact chip */}
			<div className="md:hidden mt-1 pl-11">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setIsExpanded(!isExpanded);
					}}
					className="text-xs text-muted bg-platinum/40 dark:bg-white/5 rounded-full px-2.5 py-0.5 hover:bg-platinum/60 transition-colors"
					aria-expanded={isExpanded}
					aria-label={ariaLabel}
				>
					{chipLabel}
					<span className="ml-1 opacity-60">{isExpanded ? "▴" : "▾"}</span>
				</button>
				{isExpanded && (
					<div className="mt-1.5 text-xs text-muted space-y-0.5">
						<span className="block text-muted/80">From:</span>
						{sources.map((source) => (
							<span key={source.id ?? source.name} className="block">
								{source.id ? (
									<Link
										to={`/hub/galley/${source.id}`}
										className="text-hyper-green hover:underline"
									>
										{source.name}
									</Link>
								) : (
									source.name
								)}
							</span>
						))}
					</div>
				)}
			</div>
		</>
	);
}
