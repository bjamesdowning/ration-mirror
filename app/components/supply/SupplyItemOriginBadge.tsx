import { CalendarDays, ChefHat, Package, Pencil } from "lucide-react";
import type { SupplyItemOrigin } from "~/lib/supply-item-origins";
import { humanizeSupplyOrigins } from "~/lib/supply-item-origins";

const ORIGIN_ICONS: Record<SupplyItemOrigin, typeof CalendarDays> = {
	manifest: CalendarDays,
	galley: ChefHat,
	cargo: Package,
	manual: Pencil,
};

interface SupplyItemOriginBadgeProps {
	origins: SupplyItemOrigin[];
	className?: string;
	/** When true, show compact icon-only badges */
	compact?: boolean;
}

/**
 * Hub-icon badges showing whether a supply row came from Manifest, Galley, Cargo, or manual entry.
 */
export function SupplyItemOriginBadge({
	origins,
	className = "",
	compact = false,
}: SupplyItemOriginBadgeProps) {
	if (origins.length === 0) {
		return null;
	}

	const label = humanizeSupplyOrigins(origins);

	if (compact) {
		return (
			<span
				className={`inline-flex items-center gap-1 ${className}`}
				title={label}
			>
				{origins.map((origin) => {
					const Icon = ORIGIN_ICONS[origin];
					return (
						<span
							key={origin}
							className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-hyper-green/10 text-hyper-green"
						>
							<Icon className="w-3 h-3" aria-hidden />
						</span>
					);
				})}
			</span>
		);
	}

	return (
		<span
			className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}
			title={label}
		>
			{origins.map((origin) => {
				const Icon = ORIGIN_ICONS[origin];
				const names: Record<SupplyItemOrigin, string> = {
					manifest: "Manifest",
					galley: "Galley",
					cargo: "Cargo",
					manual: "Manual",
				};
				return (
					<span
						key={origin}
						className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-hyper-green/10 text-hyper-green font-medium"
					>
						<Icon className="w-3 h-3" aria-hidden />
						{names[origin]}
					</span>
				);
			})}
		</span>
	);
}
