import { Link } from "react-router";

type CapacityIndicatorProps = {
	label: string;
	current: number;
	limit: number; // -1 = unlimited → renders nothing
	onUpgrade?: () => void;
};

/**
 * Inline capacity progress bar. Shows usage vs limit for free-tier users.
 * - Platinum at <80%, amber warning at ≥80%, red critical at limit.
 * - Unlimited tier (limit === -1): renders nothing.
 */
export function CapacityIndicator({
	label,
	current,
	limit,
}: CapacityIndicatorProps) {
	if (limit === -1) return null;

	const pct = Math.min(100, Math.round((current / limit) * 100));
	const isWarning = pct >= 80 && pct < 100;
	const isCritical = pct >= 100;

	const barColor = isCritical
		? "bg-red-400"
		: isWarning
			? "bg-amber-400"
			: "bg-hyper-green/60";

	const textColor = isCritical
		? "text-red-500"
		: isWarning
			? "text-amber-500"
			: "text-muted";

	return (
		<div className="-mt-2 mb-3 flex flex-col gap-1">
			<div className="flex items-center justify-between">
				<span className={`text-xs font-mono ${textColor}`}>
					{current}/{limit} {label}
				</span>
				{(isWarning || isCritical) && (
					<Link
						to="/hub/pricing"
						className="text-[10px] font-bold uppercase tracking-wider text-hyper-green hover:underline"
					>
						{isCritical ? "Limit reached — Upgrade" : "Upgrade for unlimited"}
					</Link>
				)}
			</div>
			<div className="h-1 w-full rounded-full bg-platinum overflow-hidden">
				<div
					className={`h-full rounded-full transition-all duration-500 ${barColor}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
