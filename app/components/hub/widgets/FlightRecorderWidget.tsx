import type { HubWidgetProps } from "~/lib/types";

const EVENT_LABELS: Record<string, string> = {
	galley_cooked: "Cooked",
	manifest_consumed: "Manifest",
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
			<p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
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

	return (
		<div className="glass-panel rounded-xl p-4 space-y-3">
			<div className="flex items-baseline justify-between gap-2">
				<h3 className="text-sm font-semibold uppercase tracking-wider text-carbon dark:text-white">
					Flight Recorder
				</h3>
				<span className="text-xs text-muted">This week</span>
			</div>

			<div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-4"}`}>
				<StatChip label="Cooked" value={stats.totals.cooked} />
				<StatChip label="Docked" value={stats.totals.docked} />
				<StatChip
					label="Expired"
					value={stats.totals.expired}
					highlight={stats.totals.expired > 0}
				/>
				<StatChip label="Jettisoned" value={stats.totals.jettisoned} />
			</div>

			{recent.length > 0 ? (
				<ul className="divide-y divide-platinum dark:divide-white/10">
					{recent.slice(0, recentLimit).map((event) => (
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
								</p>
							</div>
							<span className="text-xs text-muted whitespace-nowrap">
								{formatRelative(event.occurredAt)}
							</span>
						</li>
					))}
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
