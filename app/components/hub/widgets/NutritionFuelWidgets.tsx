import type { ReactNode } from "react";
import { Link } from "react-router";
import {
	adherenceDayCount,
	averageDailyAmounts,
	fillSparseNutritionDays,
	type NutritionHubDisplayMode,
	type NutritionHubNutrient,
	normalizeNutritionDisplayMode,
	normalizeNutritionHubNutrients,
	normalizeNutritionHubRange,
	nutrientActual,
	nutrientLabel,
	nutrientOverage,
	nutrientRatio,
	nutrientRemaining,
	nutrientShortLabel,
	nutrientTarget,
	nutrientUnit,
	nutritionChartFill,
} from "~/lib/nutrition/hub-widgets";
import type { NutritionSummary } from "~/lib/schemas/nutrition";
import type { HubWidgetFilters, HubWidgetProps } from "~/lib/types";

export const NUTRITION_GOALS_HREF = "/hub/settings#nutrition-goals";

function FuelRing({
	ratio,
	label,
	valueText,
	mode,
	size = "md",
}: {
	ratio: number | null;
	label: string;
	valueText: string;
	mode: NutritionHubDisplayMode;
	size?: "sm" | "md";
}) {
	const progress = nutritionChartFill(mode, ratio);
	const over = ratio != null && ratio > 1;
	const depleting = mode === "remaining";
	const dim = size === "sm" ? 72 : 96;
	const stroke = size === "sm" ? 6 : 8;
	const r = (dim - stroke) / 2;
	const c = 2 * Math.PI * r;
	const offset = c * (1 - progress);

	return (
		<div className="flex flex-col items-center gap-2">
			<div className="relative" style={{ width: dim, height: dim }}>
				<svg
					width={dim}
					height={dim}
					className="-rotate-90 absolute inset-0"
					aria-hidden="true"
				>
					<circle
						cx={dim / 2}
						cy={dim / 2}
						r={r}
						fill="none"
						stroke="currentColor"
						strokeWidth={stroke}
						className={
							depleting
								? "text-platinum dark:text-white/20"
								: "text-platinum dark:text-white/10"
						}
					/>
					<circle
						cx={dim / 2}
						cy={dim / 2}
						r={r}
						fill="none"
						stroke="currentColor"
						strokeWidth={stroke}
						strokeLinecap="round"
						strokeDasharray={c}
						strokeDashoffset={offset}
						className={over ? "text-warning" : "text-hyper-green"}
					/>
				</svg>
				<div className="absolute inset-0 flex items-center justify-center px-2">
					<span className="font-mono text-sm font-bold text-carbon dark:text-white text-center leading-tight">
						{valueText}
					</span>
				</div>
			</div>
			<span className="text-[10px] uppercase tracking-widest text-muted">
				{label}
			</span>
		</div>
	);
}

function MacroBar({
	nutrient,
	actual,
	target,
	mode,
}: {
	nutrient: NutritionHubNutrient;
	actual: number | null;
	target: number | null;
	mode: "consumed" | "remaining";
}) {
	const ratio = nutrientRatio(actual, target);
	const remaining = nutrientRemaining(actual, target);
	const over = nutrientOverage(actual, target);
	const fill = nutritionChartFill(mode, ratio);
	const unit = nutrientUnit(nutrient);
	const depleting = mode === "remaining" && target != null;
	const display =
		mode === "remaining" && target != null
			? over != null
				? `+${Math.round(over)}${unit}`
				: `${Math.round(remaining ?? 0)}${unit} left`
			: `${Math.round(actual ?? 0)}${unit}${
					target != null ? ` / ${Math.round(target)}` : ""
				}`;

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] font-bold uppercase tracking-wide text-muted">
					{nutrientShortLabel(nutrient)}
				</span>
				<span className="font-mono text-[11px] text-carbon dark:text-white">
					{display}
				</span>
			</div>
			<div className="h-1.5 rounded-full bg-platinum dark:bg-white/10 overflow-hidden">
				<div
					className={`h-full rounded-full transition-all ${
						over != null ? "bg-warning" : "bg-hyper-green"
					} ${depleting ? "ml-auto" : ""}`}
					style={{ width: `${fill * 100}%` }}
				/>
			</div>
		</div>
	);
}

function Sparkline({ values }: { values: number[] }) {
	const max = Math.max(...values, 1);
	const bars = values.map((value, offset) => ({
		id: `bar-${offset}-${Math.round(value * 10)}`,
		value,
	}));
	return (
		<div className="flex items-end gap-0.5 h-8 w-full">
			{bars.map((bar) => (
				<div
					key={bar.id}
					className="flex-1 rounded-sm bg-hyper-green/80 min-w-[2px]"
					style={{ height: `${Math.max(8, (bar.value / max) * 100)}%` }}
				/>
			))}
		</div>
	);
}

function WidgetShell({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: ReactNode;
}) {
	return (
		<Link
			to={NUTRITION_GOALS_HREF}
			className="block glass-panel rounded-xl p-6 h-full hover:shadow-glow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-green"
		>
			<div className="flex items-start justify-between mb-4 gap-2">
				<div>
					<h3 className="text-label text-carbon dark:text-white font-bold">
						{title}
					</h3>
					{subtitle ? (
						<p className="text-xs text-muted mt-1">{subtitle}</p>
					) : null}
				</div>
				<span className="text-[10px] uppercase tracking-widest text-muted">
					Goals
				</span>
			</div>
			{children}
		</Link>
	);
}

function resolveNutrients(filters?: HubWidgetFilters): NutritionHubNutrient[] {
	return normalizeNutritionHubNutrients(filters?.nutrients);
}

function todayAmounts(summary: NutritionSummary | null | undefined) {
	const day = summary?.days?.[0];
	if (!day) return null;
	return {
		energyKcal: day.energyKcal,
		proteinG: day.proteinG,
		carbsG: day.carbsG,
		fatG: day.fatG,
		fiberG: day.fiberG,
		entryCount: day.entryCount,
	};
}

export function NutritionTodayWidget({ data, size, filters }: HubWidgetProps) {
	const summary = data.nutritionToday ?? null;
	const amounts = todayAmounts(summary);
	const nutrients = resolveNutrients(filters);
	const mode = normalizeNutritionDisplayMode(filters?.nutritionDisplay);
	const goal = summary?.goal ?? null;
	const primary = nutrients[0] ?? "energy";
	const macros = nutrients.filter((n) => n !== primary).slice(0, 3);

	if (!amounts) {
		return (
			<WidgetShell title="Daily Fuel" subtitle="Nutrition goals">
				<p className="text-sm text-muted">
					No intakes logged today. Tap to set or review your goals.
				</p>
			</WidgetShell>
		);
	}

	const primaryActual = nutrientActual(amounts, primary);
	const primaryTarget = nutrientTarget(goal, primary);
	const primaryRatio = nutrientRatio(primaryActual, primaryTarget);
	const primaryRemaining = nutrientRemaining(primaryActual, primaryTarget);
	const primaryOver = nutrientOverage(primaryActual, primaryTarget);
	const primaryValue =
		mode === "remaining" && primaryTarget != null
			? primaryOver != null
				? `+${Math.round(primaryOver)}`
				: `${Math.round(primaryRemaining ?? 0)}`
			: `${Math.round(primaryActual ?? 0)}`;
	const primaryLabel =
		mode === "remaining" && primaryTarget != null
			? primaryOver != null
				? "Over"
				: "Left"
			: nutrientLabel(primary);

	return (
		<WidgetShell
			title="Daily Fuel"
			subtitle={
				amounts.entryCount
					? `${amounts.entryCount} logged`
					: "No intakes logged today"
			}
		>
			<div
				className={`flex ${size === "sm" ? "justify-center" : "items-start gap-6"}`}
			>
				<FuelRing
					ratio={primaryRatio}
					label={primaryLabel}
					valueText={primaryValue}
					mode={mode}
					size={size === "lg" ? "md" : "sm"}
				/>
				{size !== "sm" && macros.length > 0 ? (
					<div className="flex-1 space-y-3 min-w-0">
						{macros.map((n) => (
							<MacroBar
								key={n}
								nutrient={n}
								actual={nutrientActual(amounts, n)}
								target={nutrientTarget(goal, n)}
								mode={mode}
							/>
						))}
					</div>
				) : null}
			</div>
			{size === "lg" && !goal ? (
				<p className="mt-4 text-xs text-muted">
					Set goals in Preferences to track remaining fuel.
				</p>
			) : null}
		</WidgetShell>
	);
}

export function NutritionTrendsWidget({ data, size, filters }: HubWidgetProps) {
	const summary = data.nutritionTrends ?? null;
	const nutrients = resolveNutrients(filters);
	const range = normalizeNutritionHubRange(filters?.nutritionRange);
	const adherenceKey =
		(filters?.adherenceNutrient as NutritionHubNutrient | undefined) ??
		(nutrients.includes("protein") ? "protein" : (nutrients[0] ?? "energy"));
	const goal = summary?.goal ?? null;
	const days =
		summary != null
			? fillSparseNutritionDays(summary.from, summary.to, summary.days)
			: [];
	const hasLoggedIntake = (summary?.days ?? []).some((d) => d.entryCount > 0);
	const averages = averageDailyAmounts(days);
	const adherence = adherenceDayCount(days, goal, adherenceKey);
	const primary = nutrients[0] ?? "energy";
	const sparkValues = days.map((d) => nutrientActual(d, primary) ?? 0);

	if (!averages || !hasLoggedIntake) {
		return (
			<WidgetShell title="Fuel Trends" subtitle={`Last ${range} days`}>
				<p className="text-sm text-muted">
					Log intakes from Manifest to see averages. Tap to manage goals.
				</p>
			</WidgetShell>
		);
	}

	const rows = (size === "sm" ? nutrients.slice(0, 1) : nutrients).slice(0, 4);

	return (
		<WidgetShell title="Fuel Trends" subtitle={`Avg · last ${range} days`}>
			{size !== "sm" && sparkValues.length > 0 ? (
				<div className="mb-4">
					<Sparkline values={sparkValues} />
					<p className="mt-1 text-[10px] uppercase tracking-widest text-muted">
						{nutrientLabel(primary)}
					</p>
				</div>
			) : null}
			<div className="space-y-3">
				{rows.map((n) => {
					const avg = nutrientActual(averages, n);
					const target = nutrientTarget(goal, n);
					return (
						<MacroBar
							key={n}
							nutrient={n}
							actual={avg}
							target={target}
							mode="consumed"
						/>
					);
				})}
			</div>
			{size === "lg" && goal ? (
				<p className="mt-4 text-xs text-muted">
					{adherence.hit} of {adherence.total} days hit{" "}
					{nutrientLabel(adherenceKey).toLowerCase()} goal
				</p>
			) : null}
		</WidgetShell>
	);
}
