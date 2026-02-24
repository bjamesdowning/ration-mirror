const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayTabProps {
	dates: string[];
	activeDate: string;
	today: string;
	onSelect: (date: string) => void;
}

export function DayTab({ dates, activeDate, today, onSelect }: DayTabProps) {
	return (
		<div className="flex overflow-x-auto gap-1 py-1 scrollbar-none -mx-1 px-1">
			{dates.map((date) => {
				const d = new Date(`${date}T00:00:00`);
				const dayName = DAY_NAMES[d.getDay()];
				const dayNum = d.getDate();
				const isToday = date === today;
				const isActive = date === activeDate;
				const isPast = date < today;

				return (
					<button
						key={date}
						type="button"
						onClick={() => onSelect(date)}
						className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px] transition-all ${
							isActive
								? "bg-hyper-green text-carbon shadow-glow-sm"
								: isToday
									? "bg-hyper-green/10 text-hyper-green border border-hyper-green/30"
									: isPast
										? "text-muted/60 hover:bg-platinum/50"
										: "text-muted hover:bg-platinum hover:text-carbon"
						}`}
					>
						<span className="text-[10px] font-semibold uppercase tracking-wide">
							{dayName}
						</span>
						<span
							className={`text-base font-bold ${isToday && !isActive ? "text-hyper-green" : ""}`}
						>
							{dayNum}
						</span>
					</button>
				);
			})}
		</div>
	);
}
