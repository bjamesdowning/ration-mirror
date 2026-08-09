import type { HubWidgetProps } from "~/lib/types";

const EVENT_LABELS: Record<string, string> = {
	galley_cooked: "Cooked",
	manifest_consumed: "Consumed",
	supply_docked: "Docked",
	cargo_expired: "Expired",
	cargo_jettisoned: "Jettisoned",
};

function formatRelative(isoOrDate: Date | string): string {
	const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
	const ms = Date.now() - date.getTime();
	const minutes = Math.floor(ms / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function formatConsumedDetail(payload: Record<string, unknown>): string | null {
	const kcalRaw = payload.energyKcal;
	const servingsRaw = payload.portionServings ?? payload.servings;
	const parts: string[] = [];
	if (typeof kcalRaw === "number" && Number.isFinite(kcalRaw)) {
		parts.push(`${Math.round(kcalRaw).toLocaleString("en-US")} kcal`);
	}
	if (typeof servingsRaw === "number" && Number.isFinite(servingsRaw)) {
		const s =
			servingsRaw % 1 === 0 ? String(servingsRaw) : servingsRaw.toFixed(1);
		parts.push(`${s} serving${servingsRaw === 1 ? "" : "s"}`);
	}
	return parts.length > 0 ? parts.join(" · ") : null;
}

function StatChip({
	label,
	value,
	highlight,
}: {
	label: string;
	value: number;
	highlight?: boolean;
}) {
	return (
		<div
			className={`rounded-lg px-3 py-2 ${
				highlight
					? "bg-warning/10 border border-warning/40"
					: "bg-platinum/60 dark:bg-white/5"
			}`}
		>
			<p className="text-[10px] uppercase tracking-wider text-muted truncate">
				{label}
			</p>
			<p
				className={`text-lg font-bold ${
					highlight ? "text-warning" : "text-carbon dark:text-white"
				}`}
			>
				{value}
			</p>
		</div>
	);
}

export function FlightRecorderWidget({ data, size = "md" }: HubWidgetProps) {
	const activity = data.flightRecorderActivity;
	if (!activity) {
		return (
			<div className="glass-panel rounded-xl p-4 text-sm text-muted">
				No Flight Recorder activity yet. Cook a meal or dock supply to start
				recording.
			</div>
		);
	}

	const { stats, recent } = activity;
	const compact = size === "sm";
	const recentLimit = compact ? 3 : 5;
	const consumedCount = stats.countsByType.manifest_consumed ?? 0;
	const cookedOnly = stats.countsByType.galley_cooked ?? 0;
	const splitConsume = consumedCount > 0;
	const statsGridClass = size === "lg" ? "grid-cols-4" : "grid-cols-2";

	const chips: Array<{
		label: string;
		value: number;
		highlight?: boolean;
	}> = splitConsume
		? [
				{ label: "Cooked", value: cookedOnly },
				{ label: "Consumed", value: consumedCount },
				{ label: "Docked", value: stats.totals.docked },
				{
					label: "Expired",
					value: stats.totals.expired,
					highlight: stats.totals.expired > 0,
				},
				...(size === "lg"
					? [{ label: "Jettison", value: stats.totals.jettisoned }]
					: []),
			]
		: [
				{ label: "Cooked", value: stats.totals.cooked },
				{ label: "Docked", value: stats.totals.docked },
				{
					label: "Expired",
					value: stats.totals.expired,
					highlight: stats.totals.expired > 0,
				},
				{ label: "Jettison", value: stats.totals.jettisoned },
			];

	return (
		<div className="glass-panel rounded-xl p-4 space-y-3">
			<div className="flex items-baseline justify-between gap-2">
				<h3 className="text-sm font-semibold uppercase tracking-wider text-carbon dark:text-white">
					Flight Recorder
				</h3>
				<span className="text-xs text-muted">This week</span>
			</div>

			<div className={`grid gap-2 ${statsGridClass}`}>
				{chips.map((chip) => (
					<StatChip
						key={chip.label}
						label={chip.label}
						value={chip.value}
						highlight={chip.highlight}
					/>
				))}
			</div>

			{recent.length > 0 ? (
				<ul className="divide-y divide-platinum dark:divide-white/10">
					{recent.slice(0, recentLimit).map((event) => {
						const detail =
							event.eventType === "manifest_consumed"
								? formatConsumedDetail(event.payload)
								: null;
						return (
							<li
								key={event.id}
								className="py-2 flex items-center justify-between gap-3 text-sm"
							>
								<div className="min-w-0">
									<p className="font-medium text-carbon dark:text-white truncate">
										{event.subjectName}
									</p>
									<p className="text-xs text-muted">
										{EVENT_LABELS[event.eventType] ?? event.eventType}
										{detail ? ` · ${detail}` : ""}
									</p>
								</div>
								<span className="text-xs text-muted whitespace-nowrap">
									{formatRelative(event.occurredAt)}
								</span>
							</li>
						);
					})}
				</ul>
			) : (
				<p className="text-xs text-muted">No events in the last 7 days.</p>
			)}
		</div>
	);
}

export type FlightRecorderActivity = NonNullable<
	HubWidgetProps["data"]["flightRecorderActivity"]
>;
