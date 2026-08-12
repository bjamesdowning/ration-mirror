import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
} from "~/components/icons/PageIcons";
import {
	buildMonthGrid,
	getMonthBounds,
	HISTORY_KEPT_TITLE,
	isCalendarDaySelectable,
	parseYearMonth,
	shiftYearMonth,
} from "~/lib/manifest-calendar";

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

const WEEKDAY_LABELS_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LABELS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface PlannedDatesResponse {
	dates?: string[];
	consumedDates?: string[];
	error?: string;
}

interface ManifestCalendarOverlayProps {
	planId: string;
	today: string;
	/** Currently focused day (highlights in grid). */
	selectedDate: string;
	weekStartPref: "sunday" | "monday";
	/** When true, show intake-day markers from consumedDates. */
	showConsumedMarkers?: boolean;
	onSelectDate: (date: string) => void;
	onClose: () => void;
}

export function ManifestCalendarOverlay({
	planId,
	today,
	selectedDate,
	weekStartPref,
	showConsumedMarkers = false,
	onSelectDate,
	onClose,
}: ManifestCalendarOverlayProps) {
	const initial = parseYearMonth(selectedDate);
	const [{ year, month }, setVisible] = useState(initial);

	const fetcher = useFetcher<PlannedDatesResponse>();
	const { from, to } = useMemo(
		() => getMonthBounds(year, month),
		[year, month],
	);

	useEffect(() => {
		fetcher.load(
			`/api/meal-plans/${planId}/planned-dates?from=${from}&to=${to}`,
		);
	}, [planId, from, to, fetcher.load]);

	const plannedSet = useMemo(
		() => new Set(fetcher.data?.dates ?? []),
		[fetcher.data?.dates],
	);
	const consumedSet = useMemo(
		() => new Set(fetcher.data?.consumedDates ?? []),
		[fetcher.data?.consumedDates],
	);

	const grid = useMemo(
		() => buildMonthGrid(year, month, weekStartPref),
		[year, month, weekStartPref],
	);

	const weekdayLabels =
		weekStartPref === "monday" ? WEEKDAY_LABELS_MON : WEEKDAY_LABELS_SUN;

	const goMonth = (delta: number) => {
		setVisible((prev) => shiftYearMonth(prev.year, prev.month, delta));
	};

	const handleSelect = (date: string) => {
		if (!isCalendarDaySelectable(date, today)) return;
		onSelectDate(date);
	};

	return (
		<div
			className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-4 pb-24 sm:pb-4"
			role="dialog"
			aria-modal="true"
			aria-label="Manifest calendar"
		>
			<button
				type="button"
				className="absolute inset-0 modal-scrim"
				onClick={onClose}
				aria-label="Close calendar"
			/>

			<div className="relative z-10 w-full max-w-sm bg-ceramic border border-platinum rounded-2xl shadow-glow p-5 space-y-4">
				<div className="flex items-center justify-between gap-2">
					<button
						type="button"
						onClick={() => goMonth(-1)}
						aria-label="Previous month"
						className="p-2 rounded-lg text-muted hover:text-carbon hover:bg-platinum transition-colors"
					>
						<ChevronLeftIcon className="w-4 h-4" />
					</button>
					<h2 className="text-sm font-bold text-carbon font-mono">
						{MONTH_NAMES[month - 1]} {year}
					</h2>
					<button
						type="button"
						onClick={() => goMonth(1)}
						aria-label="Next month"
						className="p-2 rounded-lg text-muted hover:text-carbon hover:bg-platinum transition-colors"
					>
						<ChevronRightIcon className="w-4 h-4" />
					</button>
				</div>

				<div className="grid grid-cols-7 gap-1 text-center">
					{weekdayLabels.map((label) => (
						<div
							key={label}
							className="text-[10px] font-mono uppercase tracking-wider text-muted py-1"
						>
							{label}
						</div>
					))}
					{grid.map((date) => {
						const inMonth = date.startsWith(
							`${year}-${String(month).padStart(2, "0")}`,
						);
						const selectable = isCalendarDaySelectable(date, today);
						const isToday = date === today;
						const isSelected = date === selectedDate;
						const hasPlan = plannedSet.has(date);
						const hasIntake = showConsumedMarkers && consumedSet.has(date);

						return (
							<button
								key={date}
								type="button"
								disabled={!selectable}
								title={!selectable ? HISTORY_KEPT_TITLE : undefined}
								aria-label={`${date}${hasPlan ? ", planned meals" : ""}${hasIntake ? ", intake logged" : ""}${isSelected ? ", selected" : ""}`}
								aria-current={isToday ? "date" : undefined}
								aria-pressed={isSelected}
								onClick={() => handleSelect(date)}
								className={[
									"relative flex flex-col items-center justify-center rounded-lg py-2 text-xs font-mono transition-colors",
									!inMonth ? "opacity-40" : "",
									!selectable
										? "text-muted/50 cursor-not-allowed"
										: "hover:bg-platinum text-carbon",
									isSelected
										? "bg-hyper-green/15 ring-1 ring-hyper-green text-carbon"
										: "",
									isToday && !isSelected ? "ring-1 ring-platinum" : "",
								]
									.filter(Boolean)
									.join(" ")}
							>
								<span>{Number(date.slice(8, 10))}</span>
								<span className="flex items-center gap-0.5 h-2 mt-0.5">
									{hasPlan && (
										<span
											className="w-1.5 h-1.5 rounded-full bg-hyper-green"
											aria-hidden
										/>
									)}
									{hasIntake && (
										<span
											className="w-1.5 h-1.5 rounded-full bg-carbon/40"
											aria-hidden
										/>
									)}
								</span>
							</button>
						);
					})}
				</div>

				<p className="text-[10px] text-muted font-mono text-center">
					Green dots mark planned meals
					{showConsumedMarkers ? " · gray marks logged intake" : ""}
				</p>
			</div>
		</div>
	);
}
