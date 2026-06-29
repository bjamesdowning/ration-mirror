import { Suspense } from "react";
import { Await } from "react-router";
import {
	ClockIcon,
	GroceryIcon,
	PantryIcon,
	SuccessIcon,
} from "~/components/icons/HubIcons";
import type { HubWidgetProps } from "~/lib/types";
import { getHubStatsGridClass } from "./hubStatsLayout";

interface StatCardProps {
	label: string;
	value: number | string;
	icon: React.ReactNode;
	highlight?: boolean;
	compact?: boolean;
}

function StatCard({ label, value, icon, highlight, compact }: StatCardProps) {
	return (
		<div
			className={`glass-panel rounded-xl flex items-center gap-3 ${
				compact ? "p-3" : "p-4"
			} ${highlight ? "border-2 border-warning" : ""}`}
		>
			{icon}
			<div className="min-w-0">
				<p
					className={`text-xs text-muted uppercase tracking-wider ${compact ? "truncate" : ""}`}
				>
					{label}
				</p>
				<p
					className={`font-bold ${compact ? "text-xl" : "text-2xl"} ${highlight ? "text-warning" : "text-carbon dark:text-white"}`}
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

function MealsReadyStat({
	mealMatches,
	compact,
}: {
	mealMatches: unknown;
	compact?: boolean;
}) {
	if (isPromise(mealMatches)) {
		return (
			<Suspense
				fallback={
					<StatCard
						label="Meals Ready"
						value="—"
						icon={<SuccessIcon />}
						compact={compact}
					/>
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
								compact={compact}
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
	return (
		<StatCard
			label="Meals Ready"
			value={count}
			icon={<SuccessIcon />}
			compact={compact}
		/>
	);
}

function SnacksReadyStat({
	snackMatches,
	compact,
}: {
	snackMatches: unknown;
	compact?: boolean;
}) {
	if (isPromise(snackMatches)) {
		return (
			<Suspense
				fallback={
					<StatCard
						label="Snacks Ready"
						value="—"
						icon={<SuccessIcon />}
						compact={compact}
					/>
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
								compact={compact}
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
	return (
		<StatCard
			label="Snacks Ready"
			value={count}
			icon={<SuccessIcon />}
			compact={compact}
		/>
	);
}

export function HubStatsWidget({ data, size = "lg" }: HubWidgetProps) {
	const { cargoStats, mealMatches, snackMatches, latestSupplyList } = data;
	const supplyCount = latestSupplyList?.items.length ?? 0;
	const compact = size === "sm";

	return (
		<div className={getHubStatsGridClass(size)}>
			<StatCard
				label="Cargo Items"
				value={cargoStats.totalItems}
				icon={<PantryIcon />}
				compact={compact}
			/>
			<StatCard
				label="Expiring Soon"
				value={cargoStats.expiringCount}
				icon={<ClockIcon />}
				highlight={cargoStats.expiringCount > 0}
				compact={compact}
			/>
			<MealsReadyStat mealMatches={mealMatches} compact={compact} />
			<SnacksReadyStat snackMatches={snackMatches} compact={compact} />
			<StatCard
				label="Supply Items"
				value={supplyCount}
				icon={<GroceryIcon />}
				compact={compact}
			/>
		</div>
	);
}
