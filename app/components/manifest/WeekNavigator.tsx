import { useNavigate } from "react-router";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
} from "~/components/icons/PageIcons";
import { addDays, getWeekEnd, getWeekStart } from "~/lib/manifest-dates";

interface WeekNavigatorProps {
	calendarSpan: 3 | 5 | 7;
	currentRangeStart: string;
	today: string;
	weekStartPref: "sunday" | "monday";
}

export function formatWeekRange(start: string, end: string): string {
	const s = new Date(`${start}T00:00:00`);
	const e = new Date(`${end}T00:00:00`);
	const monthNames = [
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
	if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
		return `${monthNames[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
	}
	if (s.getFullYear() === e.getFullYear()) {
		return `${monthNames[s.getMonth()]} ${s.getDate()} – ${monthNames[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`;
	}
	return `${monthNames[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${monthNames[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

export function WeekNavigator({
	calendarSpan,
	currentRangeStart,
	today,
	weekStartPref,
}: WeekNavigatorProps) {
	const navigate = useNavigate();
	const weekEnd =
		calendarSpan === 7
			? getWeekEnd(currentRangeStart)
			: addDays(currentRangeStart, calendarSpan - 1);

	const todayAnchor =
		calendarSpan === 7 ? getWeekStart(today, weekStartPref) : today;
	const isCurrentRange = currentRangeStart === todayAnchor;

	const goTo = (date: string) => {
		navigate(`?week=${date}`);
	};

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={() => goTo(addDays(currentRangeStart, -calendarSpan))}
				aria-label="Previous"
				className="p-2 rounded-lg text-muted hover:text-carbon hover:bg-platinum transition-colors"
			>
				<ChevronLeftIcon className="w-4 h-4" />
			</button>

			<span className="text-sm font-medium text-carbon min-w-[180px] text-center">
				{formatWeekRange(currentRangeStart, weekEnd)}
			</span>

			<button
				type="button"
				onClick={() => goTo(addDays(currentRangeStart, calendarSpan))}
				aria-label="Next"
				className="p-2 rounded-lg text-muted hover:text-carbon hover:bg-platinum transition-colors"
			>
				<ChevronRightIcon className="w-4 h-4" />
			</button>

			{!isCurrentRange && (
				<button
					type="button"
					onClick={() => goTo(todayAnchor)}
					className="ml-1 px-3 py-1.5 text-xs font-medium text-carbon bg-platinum rounded-lg hover:bg-platinum/70 transition-colors"
				>
					Today
				</button>
			)}
		</div>
	);
}
