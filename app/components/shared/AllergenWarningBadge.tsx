import { ALLERGEN_LABELS, type AllergenSlug } from "~/lib/allergens";

interface AllergenWarningBadgeProps {
	/** The allergen slugs detected in this meal. */
	triggered: AllergenSlug[];
	/** Compact mode — shows icon + count only. Default: false (shows full labels). */
	compact?: boolean;
}

/**
 * Displays a warning badge listing allergens detected in a meal.
 * Renders nothing when triggered is empty.
 */
export function AllergenWarningBadge({
	triggered,
	compact = false,
}: AllergenWarningBadgeProps) {
	if (triggered.length === 0) return null;

	const labels = triggered.map((s) => ALLERGEN_LABELS[s]);

	if (compact) {
		return (
			<div
				title={`Contains: ${labels.join(", ")}`}
				className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/15 border border-warning/30 text-warning text-xs font-medium"
			>
				<WarningIcon className="w-3 h-3 flex-shrink-0" />
				<span>{triggered.length}</span>
			</div>
		);
	}

	return (
		<div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-warning/10 border border-warning/25">
			<WarningIcon className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
			<div className="min-w-0">
				<span className="text-xs font-semibold text-warning block leading-tight">
					Contains allergens
				</span>
				<span className="text-xs text-warning/80 block leading-snug">
					{labels.join(", ")}
				</span>
			</div>
		</div>
	);
}

function WarningIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 20 20"
			fill="currentColor"
			aria-hidden="true"
		>
			<path
				fillRule="evenodd"
				d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
				clipRule="evenodd"
			/>
		</svg>
	);
}
