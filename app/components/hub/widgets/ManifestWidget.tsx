import { Link } from "react-router";
import type {
	HubWidgetProps,
	ManifestPreviewData,
	ManifestPreviewEntry,
} from "~/lib/types";

const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;
const SLOT_SHORT: Record<string, string> = {
	breakfast: "BRKFST",
	lunch: "LUNCH",
	dinner: "DINNER",
	snack: "SNACK",
};
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function getTodayISO(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function addDays(date: string, n: number): string {
	const d = new Date(`${date}T00:00:00`);
	d.setDate(d.getDate() + n);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function formatDayHeader(date: string): string {
	const d = new Date(`${date}T00:00:00`);
	const today = getTodayISO();
	if (date === today) return "Today";
	const dayName = DAY_NAMES_SHORT[d.getDay()];
	return `${dayName} ${d.getDate()}`;
}

function formatEntryLabel(entry: ManifestPreviewEntry): string {
	const name = entry.mealName.charAt(0).toUpperCase() + entry.mealName.slice(1);
	if (
		entry.mealType === "provision" &&
		entry.servingsOverride &&
		entry.servingsOverride > 1
	) {
		return `${name} (×${entry.servingsOverride})`;
	}
	return name;
}

function getDayEntries(
	entries: ManifestPreviewEntry[],
	date: string,
): ManifestPreviewEntry[] {
	return entries.filter((e) => e.date === date);
}

// Shared slot list used by Small and the Large mobile fallback
function DaySlotList({
	entries,
	date,
}: {
	entries: ManifestPreviewEntry[];
	date: string;
}) {
	const dayEntries = getDayEntries(entries, date);
	const filledSlots = dayEntries.map((e) => e.slotType);
	const emptySlots = SLOT_ORDER.filter((s) => !filledSlots.includes(s));

	if (dayEntries.length === 0) {
		return <p className="text-xs text-muted italic">No meals planned</p>;
	}

	return (
		<>
			<ul className="space-y-2">
				{SLOT_ORDER.map((slot) => {
					const slotEntries = dayEntries.filter((e) => e.slotType === slot);
					if (slotEntries.length === 0) return null;
					return (
						<li key={slot} className="flex items-start gap-2">
							<span className="text-[10px] font-mono text-muted w-12 pt-0.5 shrink-0">
								{SLOT_SHORT[slot]}
							</span>
							<div className="flex flex-col gap-0.5">
								{slotEntries.map((entry) => (
									<Link
										key={entry.mealId}
										to={`/hub/galley/${entry.mealId}`}
										className="text-xs text-hyper-green hover:underline font-medium leading-snug"
									>
										{formatEntryLabel(entry)}
									</Link>
								))}
							</div>
						</li>
					);
				})}
			</ul>
			{emptySlots.length > 0 && (
				<p className="text-[11px] text-muted mt-3">
					{emptySlots.length} empty {emptySlots.length === 1 ? "slot" : "slots"}
				</p>
			)}
		</>
	);
}

// ------ Small: Today full view with per-meal links ------
function ManifestSmall({ data }: { data: ManifestPreviewData }) {
	const today = getTodayISO();

	return (
		<div className="glass-panel p-4 rounded-2xl hover:border-hyper-green/30 transition-all h-full">
			<div className="flex items-center justify-between mb-3">
				<span className="text-xs font-semibold text-muted uppercase tracking-wide font-mono">
					Manifest
				</span>
				<Link
					to="/hub/manifest"
					className="text-xs text-hyper-green hover:underline transition-colors"
				>
					Today →
				</Link>
			</div>

			<p className="text-sm font-bold text-carbon mb-3">
				{(() => {
					const d = new Date(`${today}T00:00:00`);
					return `${DAY_NAMES_SHORT[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
				})()}
			</p>

			<DaySlotList entries={data.entries} date={today} />
		</div>
	);
}

// ------ Medium: 3-day rolling with per-meal links ------
function ManifestMedium({ data }: { data: ManifestPreviewData }) {
	const today = getTodayISO();
	const days = [today, addDays(today, 1), addDays(today, 2)];

	return (
		<div className="glass-panel p-4 rounded-2xl hover:border-hyper-green/30 transition-all">
			<div className="flex items-center justify-between mb-3">
				<span className="text-xs font-semibold text-muted uppercase tracking-wide font-mono">
					Manifest
				</span>
				<Link
					to="/hub/manifest"
					className="text-xs text-hyper-green hover:underline transition-colors"
				>
					View Plan →
				</Link>
			</div>

			<div className="grid grid-cols-3 gap-2">
				{days.map((date, i) => {
					const dayEntries = getDayEntries(data.entries, date);
					const isToday = i === 0;

					return (
						<div key={date} className="flex flex-col gap-1.5">
							<div
								className={`text-center py-1.5 rounded-lg text-xs font-semibold ${
									isToday
										? "bg-hyper-green text-carbon"
										: "bg-platinum/60 text-muted"
								}`}
							>
								{formatDayHeader(date)}
							</div>
							<div
								className={`rounded-lg border p-1.5 space-y-1.5 min-h-[48px] ${
									isToday ? "border-hyper-green/20" : "border-platinum/50"
								}`}
							>
								{dayEntries.length === 0 ? (
									<div className="flex items-center justify-center h-8">
										<span className="text-[10px] text-muted">—</span>
									</div>
								) : (
									SLOT_ORDER.map((slot) => {
										const slotEntries = dayEntries.filter(
											(e) => e.slotType === slot,
										);
										if (slotEntries.length === 0) return null;
										return (
											<div key={slot} className="space-y-0.5">
												<p className="text-[9px] font-mono text-muted uppercase">
													{SLOT_SHORT[slot]}
												</p>
												{slotEntries.map((entry) => (
													<Link
														key={entry.mealId}
														to={`/hub/galley/${entry.mealId}`}
														className="block text-[11px] text-hyper-green hover:underline font-medium leading-snug"
													>
														{formatEntryLabel(entry)}
													</Link>
												))}
											</div>
										);
									})
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ------ Large: Full 7-day week (desktop) / today only (mobile) ------
function ManifestLarge({ data }: { data: ManifestPreviewData }) {
	const today = getTodayISO();
	const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

	return (
		<div className="glass-panel p-4 rounded-2xl hover:border-hyper-green/30 transition-all">
			<div className="flex items-center justify-between mb-3">
				<span className="text-xs font-semibold text-muted uppercase tracking-wide font-mono">
					Manifest
				</span>
				<Link
					to="/hub/manifest"
					className="text-xs text-hyper-green hover:underline transition-colors"
				>
					View Plan →
				</Link>
			</div>

			{/* Mobile: today only — 7 narrow columns are too small to be usable */}
			<div className="md:hidden">
				<p className="text-sm font-bold text-carbon mb-3">
					{(() => {
						const d = new Date(`${today}T00:00:00`);
						return `${DAY_NAMES_SHORT[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
					})()}
				</p>
				<DaySlotList entries={data.entries} date={today} />
			</div>

			{/* Desktop: full 7-day grid with per-meal links */}
			<div className="hidden md:grid grid-cols-7 gap-1.5">
				{days.map((date) => {
					const d = new Date(`${date}T00:00:00`);
					const isToday = date === today;
					const dayEntries = getDayEntries(data.entries, date);

					return (
						<div key={date} className="flex flex-col gap-1">
							<div
								className={`text-center py-1.5 rounded-lg ${
									isToday
										? "bg-hyper-green text-carbon"
										: "bg-platinum/50 text-muted"
								}`}
							>
								<p className="text-[9px] font-semibold uppercase">
									{DAY_NAMES_SHORT[d.getDay()]}
								</p>
								<p className="text-xs font-bold">{d.getDate()}</p>
							</div>
							<div
								className={`rounded-lg border p-1 space-y-1 min-h-[36px] ${
									isToday
										? "border-hyper-green/20 bg-hyper-green/5"
										: "border-platinum/30"
								}`}
							>
								{dayEntries.length === 0 ? (
									<p className="text-center text-muted text-[10px] mt-1">—</p>
								) : (
									SLOT_ORDER.map((slot) => {
										const slotEntries = dayEntries.filter(
											(e) => e.slotType === slot,
										);
										if (slotEntries.length === 0) return null;
										return (
											<div key={slot} className="space-y-0.5">
												{slotEntries.map((entry) => (
													<Link
														key={entry.mealId}
														to={`/hub/galley/${entry.mealId}`}
														className="block text-[10px] text-hyper-green hover:underline font-medium line-clamp-2 leading-tight"
														title={formatEntryLabel(entry)}
													>
														{formatEntryLabel(entry)}
													</Link>
												))}
											</div>
										);
									})
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ------ Empty state ------
function ManifestEmpty({ size: _size }: { size: "sm" | "md" | "lg" }) {
	return (
		<div className="glass-panel p-4 rounded-2xl border-dashed hover:border-hyper-green/30 transition-all flex flex-col items-center justify-center text-center min-h-[80px]">
			<p className="text-xs font-semibold text-muted mb-1">Manifest</p>
			<p className="text-xs text-muted">No meals planned this week</p>
			<Link
				to="/hub/manifest"
				className="text-xs text-hyper-green hover:underline mt-1 transition-colors"
			>
				Plan meals →
			</Link>
		</div>
	);
}

export function ManifestWidget({ data, size = "md" }: HubWidgetProps) {
	const preview = data.manifestPreview as ManifestPreviewData | null;

	if (!preview?.planId) {
		return <ManifestEmpty size={size} />;
	}

	if (preview.entries.length === 0) {
		return <ManifestEmpty size={size} />;
	}

	if (size === "sm") return <ManifestSmall data={preview} />;
	if (size === "lg") return <ManifestLarge data={preview} />;
	return <ManifestMedium data={preview} />;
}
