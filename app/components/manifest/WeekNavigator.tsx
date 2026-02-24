import { useNavigate } from "react-router";
import { getTodayISO, getWeekEnd, getWeekStart } from "~/lib/manifest-dates";

interface WeekNavigatorProps {
	currentWeekStart: string;
	weekStart?: "sunday" | "monday";
}

function formatWeekRange(start: string, end: string): string {
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

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00`);
	d.setDate(d.getDate() + days);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function WeekNavigator({
	currentWeekStart,
	weekStart = "sunday",
}: WeekNavigatorProps) {
	const navigate = useNavigate();
	const weekEnd = getWeekEnd(currentWeekStart);
	const today = getTodayISO();
	const currentStart = getWeekStart(today, weekStart);
	const isCurrentWeek = currentWeekStart === currentStart;

	const goTo = (weekStartDate: string) => {
		navigate(`?week=${weekStartDate}`);
	};

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={() => goTo(addDays(currentWeekStart, -7))}
				aria-label="Previous week"
				className="p-2 rounded-lg text-muted hover:text-carbon hover:bg-platinum transition-colors"
			>
				<svg
					className="w-4 h-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<title>Previous week</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M15 19l-7-7 7-7"
					/>
				</svg>
			</button>

			<span className="text-sm font-medium text-carbon min-w-[180px] text-center">
				{formatWeekRange(currentWeekStart, weekEnd)}
			</span>

			<button
				type="button"
				onClick={() => goTo(addDays(currentWeekStart, 7))}
				aria-label="Next week"
				className="p-2 rounded-lg text-muted hover:text-carbon hover:bg-platinum transition-colors"
			>
				<svg
					className="w-4 h-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<title>Next week</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 5l7 7-7 7"
					/>
				</svg>
			</button>

			{!isCurrentWeek && (
				<button
					type="button"
					onClick={() => goTo(currentStart)}
					className="ml-1 px-3 py-1.5 text-xs font-medium text-carbon bg-platinum rounded-lg hover:bg-platinum/70 transition-colors"
				>
					Today
				</button>
			)}
		</div>
	);
}
