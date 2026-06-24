import { Link } from "react-router";
import {
	resolveSupplyItemSources,
	type SupplyItemSourceInput,
} from "~/lib/supply-sources";

interface SupplyItemSourceLineProps extends SupplyItemSourceInput {}

const MAX_VISIBLE_MEALS = 2;

/**
 * Desktop inline source line for supply items.
 * Mobile sources are shown in SupplyItemActionsSheet.
 */
export function SupplyItemSourceLine({
	sourceMealName,
	sourceMealNames,
	sourceMealSources,
}: SupplyItemSourceLineProps) {
	const sources = resolveSupplyItemSources({
		sourceMealName,
		sourceMealNames,
		sourceMealSources,
	});

	const allNames = sources.map((s) => s.name);
	const ariaLabel =
		sources.length === 0
			? "Source: Added manually"
			: `Source meals: ${allNames.join(", ")}`;

	if (sources.length === 0) {
		return (
			<span
				className="hidden md:block text-xs text-muted mt-0.5 pl-8 md:pl-11"
				title={ariaLabel}
			>
				Added manually
			</span>
		);
	}

	const visibleSources = sources.slice(0, MAX_VISIBLE_MEALS);
	const hiddenCount = sources.length - MAX_VISIBLE_MEALS;

	return (
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
	);
}
