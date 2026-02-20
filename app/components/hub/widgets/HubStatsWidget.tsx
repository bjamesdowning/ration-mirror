import {
	ClockIcon,
	GroceryIcon,
	PantryIcon,
	SuccessIcon,
} from "~/components/icons/HubIcons";
import type { HubWidgetProps } from "~/lib/types";

interface StatCardProps {
	label: string;
	value: number;
	icon: React.ReactNode;
	highlight?: boolean;
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
	return (
		<div
			className={`glass-panel rounded-xl p-4 flex items-center gap-3 ${
				highlight ? "border-2 border-warning" : ""
			}`}
		>
			{icon}
			<div>
				<p className="text-xs text-muted uppercase tracking-wider">{label}</p>
				<p
					className={`text-2xl font-bold ${highlight ? "text-warning" : "text-carbon dark:text-white"}`}
				>
					{value}
				</p>
			</div>
		</div>
	);
}

export function HubStatsWidget({ data }: HubWidgetProps) {
	const { cargoStats, mealMatches, latestSupplyList } = data;
	const mealsReadyCount = mealMatches.filter((m) => m.canMake).length;
	const supplyCount = latestSupplyList?.items.length ?? 0;

	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
			<StatCard
				label="Cargo Items"
				value={cargoStats.totalItems}
				icon={<PantryIcon />}
			/>
			<StatCard
				label="Expiring Soon"
				value={cargoStats.expiringCount}
				icon={<ClockIcon />}
				highlight={cargoStats.expiringCount > 0}
			/>
			<StatCard
				label="Meals Ready"
				value={mealsReadyCount}
				icon={<SuccessIcon />}
			/>
			<StatCard
				label="Supply Items"
				value={supplyCount}
				icon={<GroceryIcon />}
			/>
		</div>
	);
}
