import { Suspense } from "react";
import { Await } from "react-router";
import {
	ClockIcon,
	GroceryIcon,
	PantryIcon,
	SuccessIcon,
} from "~/components/icons/HubIcons";
import type { HubWidgetProps } from "~/lib/types";

interface StatCardProps {
	label: string;
	value: number | string;
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

function isPromise<T>(v: T | Promise<T>): v is Promise<T> {
	return v != null && typeof (v as Promise<T>).then === "function";
}

function MealsReadyStat({ mealMatches }: { mealMatches: unknown }) {
	if (isPromise(mealMatches)) {
		return (
			<Suspense
				fallback={
					<StatCard label="Meals Ready" value="—" icon={<SuccessIcon />} />
				}
			>
				<Await resolve={mealMatches}>
					{(resolved) => {
						const count = (Array.isArray(resolved) ? resolved : []).filter(
							(m: { canMake?: boolean }) => m.canMake,
						).length;
						return (
							<StatCard
								label="Meals Ready"
								value={count}
								icon={<SuccessIcon />}
							/>
						);
					}}
				</Await>
			</Suspense>
		);
	}
	const count = (Array.isArray(mealMatches) ? mealMatches : []).filter(
		(m: { canMake?: boolean }) => m.canMake,
	).length;
	return <StatCard label="Meals Ready" value={count} icon={<SuccessIcon />} />;
}

function SnacksReadyStat({ snackMatches }: { snackMatches: unknown }) {
	if (isPromise(snackMatches)) {
		return (
			<Suspense
				fallback={
					<StatCard label="Snacks Ready" value="—" icon={<SuccessIcon />} />
				}
			>
				<Await resolve={snackMatches}>
					{(resolved) => {
						const count = (Array.isArray(resolved) ? resolved : []).filter(
							(m: { canMake?: boolean }) => m.canMake,
						).length;
						return (
							<StatCard
								label="Snacks Ready"
								value={count}
								icon={<SuccessIcon />}
							/>
						);
					}}
				</Await>
			</Suspense>
		);
	}
	const count = (Array.isArray(snackMatches) ? snackMatches : []).filter(
		(m: { canMake?: boolean }) => m.canMake,
	).length;
	return <StatCard label="Snacks Ready" value={count} icon={<SuccessIcon />} />;
}

export function HubStatsWidget({ data }: HubWidgetProps) {
	const { cargoStats, mealMatches, snackMatches, latestSupplyList } = data;
	const supplyCount = latestSupplyList?.items.length ?? 0;

	return (
		<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
			<MealsReadyStat mealMatches={mealMatches} />
			<SnacksReadyStat snackMatches={snackMatches} />
			<StatCard
				label="Supply Items"
				value={supplyCount}
				icon={<GroceryIcon />}
			/>
		</div>
	);
}
